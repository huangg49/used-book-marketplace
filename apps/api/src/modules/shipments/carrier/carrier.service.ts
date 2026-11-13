import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongoService } from '../../../database/mongo/mongo.service.js';
import { canStartCarrierPickup, hasCarrierLabels } from '../../exchanges/exchange-carrier-pickup.js';
import { EXCHANGE_INSPECTION_MS, inspectionDeadlines } from '../../exchanges/exchange-inspection.js';
import { invalidState, notFound } from '../../commands/domain-error.js';
import { notifyExchange } from '../../exchanges/exchange-notifications.js';
import type {
  CarrierAddress,
  CarrierStatus,
  CarrierStatusCode,
  ICarrierAdapter,
  ShipmentOrderInput,
} from './carrier.interface.js';
import { CarrierSimulatorAdapter } from './carrier-simulator.adapter.js';
import { GhnAdapter } from './ghn.adapter.js';

@Injectable()
export class CarrierService {
  private readonly logger = new Logger(CarrierService.name);
  private readonly adapters = new Map<string, ICarrierAdapter>();

  constructor(
    private readonly simulatorAdapter: CarrierSimulatorAdapter,
    private readonly ghnAdapter: GhnAdapter,
    @Optional() private readonly mongo?: MongoService,
    @Optional() private readonly config?: ConfigService,
  ) {
    // Đăng ký adapter mô phỏng và adapter GHN thật
    this.registerAdapter(simulatorAdapter);
    this.registerAdapter(ghnAdapter);
  }

  /**
   * Đăng ký một Adapter mới (sẵn sàng chân cắm cho GhnAdapter / GhtkAdapter ở Giai đoạn 3)
   */
  registerAdapter(adapter: ICarrierAdapter) {
    this.adapters.set(adapter.carrierCode.toUpperCase(), adapter);
    this.logger.log(`[CarrierService] Đã đăng ký Carrier Adapter: ${adapter.carrierCode} (${adapter.carrierName})`);
  }

  /**
   * Lấy Adapter phù hợp, mặc định trả về Bộ mô phỏng
   */
  getAdapter(carrierCode?: string): ICarrierAdapter {
    if (!carrierCode) return this.simulatorAdapter;
    const found = this.adapters.get(carrierCode.toUpperCase());
    return found || this.simulatorAdapter;
  }

  async calculateFee(
    fromAddress: CarrierAddress,
    toAddress: CarrierAddress,
    carrierCode?: string,
  ): Promise<number> {
    const adapter = this.getAdapter(carrierCode);
    return adapter.calculateFee(fromAddress, toAddress);
  }

  async createShipment(
    order: ShipmentOrderInput,
  ): Promise<{ trackingCode: string; fee: number }> {
    if (this.mongo && order.carrierCode?.toUpperCase() === 'GHN' &&
      await this.mongo.c.exchanges.findOne({ _id: order.orderId }, { projection: { _id: 1 } })) {
      throw invalidState('Tạo đơn hãng trực tiếp chưa hỗ trợ điều phối lấy hai kiện cho phiếu đổi sách.');
    }
    const adapter = this.getAdapter(order.carrierCode);
    return adapter.createShipment(order);
  }

  async getTrackingStatus(
    trackingCode: string,
    carrierCode?: string,
  ): Promise<CarrierStatus> {
    const adapter = this.getAdapter(carrierCode);
    return adapter.getTrackingStatus(trackingCode);
  }

  requireLocalDriver(
    remoteAddress: string | undefined,
    browserSources: Array<string | undefined>,
    forwardedFor?: string,
  ) {
    const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
    if (!this.config || !['development', 'test'].includes(this.config.get('NODE_ENV', 'development')) ||
      !this.config.get('PAYMENT_SIMULATOR_SECRET') ||
      !loopback.includes(remoteAddress ?? '') ||
      forwardedFor?.split(',').some(address => !loopback.includes(address.trim()))) throw notFound();
    const mongo = new URL(this.config.getOrThrow<string>('MONGODB_URL'));
    if (mongo.protocol !== 'mongodb:' || !['127.0.0.1', 'localhost', '[::1]'].includes(mongo.hostname))
      throw notFound();
    for (const source of browserSources) {
      if (source === undefined) continue;
      const url = URL.parse(source.includes('://') ? source : `http://${source}`);
      if (!url || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw notFound();
    }
  }

  async processWebhook(event: {
    trackingCode: string;
    status: CarrierStatusCode;
    description?: string;
  }) {
    const { trackingCode, status, description } = event;
    if (!this.mongo) {
      if (!this.simulatorAdapter.setShipmentStatus(trackingCode, status, description)) throw notFound();
      return { success: true, exchangeUpdated: false };
    }
    const next = await this.mongo.tx(async (tx) => {
      const matches = await tx.c.exchanges.find({
        $or: [
          { 'initiatorShipment.trackingCode': trackingCode },
          { 'recipientShipment.trackingCode': trackingCode },
        ],
        status: { $in: ['Preparing', 'InTransit', 'Delivered'] },
      }).limit(2).toArray();
      if (matches.length !== 1) throw invalidState('Không xác định được đúng kiện đang giao.');
      const [{ _id: id }] = matches;
      await tx.lock('exchanges', [id]);
      const row = await tx.c.exchanges.findOne({ _id: id });
      if (!row || !['Preparing', 'InTransit', 'Delivered'].includes(row.status) || !hasCarrierLabels(row))
        throw invalidState('Phiếu cần đủ hai mã vận đơn và còn ở bước giao nhận.');

      const initiator = row.initiatorShipment?.trackingCode === trackingCode;
      const leg = initiator ? row.initiatorShipment : row.recipientShipment;
      if (leg?.trackingCode !== trackingCode) throw invalidState();
      const sentAt = initiator ? row.initiatorShippedAt : row.recipientShippedAt;
      const otherSentAt = initiator ? row.recipientShippedAt : row.initiatorShippedAt;
      const receivedAt = initiator ? row.recipientReceivedAt : row.initiatorReceivedAt;
      const otherReceivedAt = initiator ? row.initiatorReceivedAt : row.recipientReceivedAt;
      const now = await tx.now();
      const pickup = status === 'PICKING';
      if ((pickup && sentAt) || (status === 'DELIVERED' && receivedAt))
        return { status: row.status, changed: false };
      if (row.status === 'Delivered' || receivedAt || (pickup
        ? !canStartCarrierPickup(row, now)
        : !sentAt || !['IN_TRANSIT', 'DELIVERED'].includes(status))) {
        throw invalidState('Chỉ lấy sách khi đủ hai đơn và còn hạn. Kiện phải được lấy trước khi giao.');
      }

      const shipmentKey = initiator ? 'initiatorShipment' : 'recipientShipment';
      const changes: Partial<typeof row> = {
        updatedAt: now,
        [shipmentKey]: {
          ...leg,
          ...(pickup ? { shippedAt: now } : {}),
          lastEvent: description || (pickup ? 'Bưu tá đã lấy sách' : status === 'DELIVERED' ? 'Đã giao sách' : 'Đang vận chuyển'),
          lastEventAt: now,
        },
      };
      if (pickup) {
        if (initiator) changes.initiatorShippedAt = now;
        else changes.recipientShippedAt = now;
        changes.cancellationRequestedBy = null;
        changes.cancellationRequestedAt = null;
        if (otherSentAt) changes.status = 'InTransit';
      }
      if (status === 'DELIVERED') {
        const deadline = new Date(+now + EXCHANGE_INSPECTION_MS);
        if (initiator) {
          changes.recipientReceivedAt = now;
          changes.recipientInspectionDeadline = deadline;
        } else {
          changes.initiatorReceivedAt = now;
          changes.initiatorInspectionDeadline = deadline;
        }
        if (otherReceivedAt) {
          changes.status = 'Delivered';
          changes.inspectionDeadline = inspectionDeadlines({ ...row, ...changes }).all;
        }
      }
      const updated = await tx.c.exchanges.findOneAndUpdate(
        { _id: id, revision: row.revision },
        { $set: changes, $inc: { revision: 1 } },
        { returnDocument: 'after' },
      );
      if (!updated) throw invalidState();
      if (pickup) {
        await notifyExchange(tx, updated, 'ExchangeShipped',
          [initiator ? row.recipientId : row.initiatorId], now, { trackingCode });
      } else if (status === 'DELIVERED') {
        await notifyExchange(tx, updated, 'ExchangeReceived',
          [row.initiatorId, row.recipientId], now);
      }
      return { status: updated.status, changed: true };
    });
    if (next.changed) this.simulatorAdapter.setShipmentStatus(trackingCode, status, description);
    return { success: true, exchangeUpdated: next.changed, nextStatus: next.status };
  }

  private async getBookTitle(listingId?: string): Promise<string | null> {
    if (!listingId || !this.mongo) return null;
    try {
      const listing = await this.mongo.c.listings.findOne({ _id: listingId });
      const rev = listing?.currentRevisionId
        ? await this.mongo.c.listing_revisions.findOne({ _id: listing.currentRevisionId })
        : null;
      if (rev?.bookId) {
        const book = await this.mongo.c.catalog_books.findOne({ _id: rev.bookId });
        if (book?.currentRevisionId) {
          const catRev = await this.mongo.c.catalog_revisions.findOne({ _id: book.currentRevisionId });
          if (catRev?.title) return catRev.title;
        }
        const catRev = await this.mongo.c.catalog_revisions.findOne(
          { bookId: rev.bookId },
          { sort: { number: -1 } },
        );
        return catRev?.title ?? book?.titleKey ?? null;
      }
    } catch {
      // ignore
    }
    return null;
  }

  /**
   * Lấy thông tin đơn hàng vận chuyển thật từ Database cho tài xế GHN
   * Hỗ trợ đầy đủ 2 kiện hàng (Initiator Leg & Recipient Leg) của cuộc trao đổi
   */
  async getShipmentOrder(trackingCode?: string, exchangeId?: string, leg?: 'initiator' | 'recipient') {
    if (!this.mongo) return null;

    let exchange: any = null;

    if (exchangeId) {
      exchange = await this.mongo.c.exchanges.findOne({ _id: exchangeId });
    } else if (trackingCode) {
      exchange = await this.mongo.c.exchanges.findOne({
        $or: [
          { 'initiatorShipment.trackingCode': trackingCode },
          { 'recipientShipment.trackingCode': trackingCode },
        ],
      });
    } else {
      // 1. Ưu tiên đơn đang giao (InTransit) hoặc vừa giao (Delivered)
      exchange = await this.mongo.c.exchanges.findOne(
        {
          status: { $in: ['InTransit', 'Delivered'] },
        },
        { sort: { updatedAt: -1 } },
      );

      // 2. Đơn đang chuẩn bị (Preparing)
      if (!exchange) {
        exchange = await this.mongo.c.exchanges.findOne(
          {
            status: 'Preparing',
          },
          { sort: { updatedAt: -1 } },
        );
      }

      // 3. Fallback: Đơn gần nhất
      if (!exchange) {
        exchange = await this.mongo.c.exchanges.findOne(
          {},
          { sort: { updatedAt: -1 } },
        );
      }
    }

    if (!exchange) return null;

    const isBothCreated = hasCarrierLabels(exchange);

    const isWaitingPartner = !isBothCreated;

    // Lấy thông tin user 2 bên
    const initiatorUser = exchange.initiatorId
      ? await this.mongo.c.users.findOne({ _id: exchange.initiatorId })
      : null;
    const recipientUser = exchange.recipientId
      ? await this.mongo.c.users.findOne({ _id: exchange.recipientId })
      : null;

    // Lấy tên sách 2 bên
    const listingIdA = exchange.initiatorListingIds?.[0] || exchange.initiatorListingId;
    const listingIdB = exchange.recipientListingId;
    const bookTitleA = await this.getBookTitle(listingIdA);
    const bookTitleB = await this.getBookTitle(listingIdB);

    const nameA = exchange.initiatorAddress?.recipientName || initiatorUser?.displayName || 'Bên A';
    const nameB = exchange.recipientAddress?.recipientName || recipientUser?.displayName || 'Bên B';

    // Kiện 1: Initiator -> Recipient (Bên A gửi bên B)
    const leg1 = {
      leg: 'initiator' as const,
      label: `Kiện 1: ${nameA} ➔ ${nameB} (Chiều đi)`,
      trackingCode: exchange.initiatorShipment?.trackingCode || 'CHỜ TẠO ĐƠN (CHIỀU ĐI)',
      carrierCode: exchange.initiatorShipment?.carrierCode || 'GHN',
      carrierName: exchange.initiatorShipment?.carrierName || 'Giao Hàng Nhanh (GHN Express)',
      sender: {
        name: `${nameA} (Người gửi)`,
        phone: exchange.initiatorAddress?.phone || '0901234567',
        detail: exchange.initiatorAddress?.detail || '123 Nguyễn Huệ, P. Bến Nghé, Quận 1',
      },
      receiver: {
        name: `${nameB} (Người nhận)`,
        phone: exchange.recipientAddress?.phone || '0373916690',
        detail: exchange.recipientAddress?.detail || '120 Yên Lãng',
      },
      itemsSummary: bookTitleA ? `Tác phẩm: "${bookTitleA}"` : 'Sách: "Rừng Na Uy" (Trao đổi)',
      fee: 21000,
      shippedAt: exchange.initiatorShipment?.shippedAt || exchange.initiatorShippedAt || null,
      deliveredAt: exchange.recipientReceivedAt || null,
      isDelivered: Boolean(exchange.recipientReceivedAt),
      lastEvent: (exchange.initiatorShipment as any)?.lastEvent || null,
    };

    // Kiện 2: Recipient -> Initiator (Bên B gửi bên A)
    const leg2 = {
      leg: 'recipient' as const,
      label: `Kiện 2: ${nameB} ➔ ${nameA} (Chiều về)`,
      trackingCode: exchange.recipientShipment?.trackingCode || 'CHỜ TẠO ĐƠN (CHIỀU VỀ)',
      carrierCode: exchange.recipientShipment?.carrierCode || 'GHN',
      carrierName: exchange.recipientShipment?.carrierName || 'Giao Hàng Nhanh (GHN Express)',
      sender: {
        name: `${nameB} (Người gửi)`,
        phone: exchange.recipientAddress?.phone || '0373916690',
        detail: exchange.recipientAddress?.detail || '120 Yên Lãng',
      },
      receiver: {
        name: `${nameA} (Người nhận)`,
        phone: exchange.initiatorAddress?.phone || '0901234567',
        detail: exchange.initiatorAddress?.detail || '123 Nguyễn Huệ, P. Bến Nghé, Quận 1',
      },
      itemsSummary: bookTitleB ? `Tác phẩm: "${bookTitleB}"` : 'Sách: "Đại Gia Gatsby" (Trao đổi)',
      fee: 21000,
      shippedAt: exchange.recipientShipment?.shippedAt || exchange.recipientShippedAt || null,
      deliveredAt: exchange.initiatorReceivedAt || null,
      isDelivered: Boolean(exchange.initiatorReceivedAt),
      lastEvent: (exchange.recipientShipment as any)?.lastEvent || null,
    };

    // Xác định kiện nào đang active
    let activeLeg: 'initiator' | 'recipient' = 'initiator';
    if (leg === 'recipient' || (trackingCode && trackingCode === exchange.recipientShipment?.trackingCode)) {
      activeLeg = 'recipient';
    } else if (leg === 'initiator' || (trackingCode && trackingCode === exchange.initiatorShipment?.trackingCode)) {
      activeLeg = 'initiator';
    } else if (leg1.isDelivered && !leg2.isDelivered) {
      // Nếu kiện 1 đã giao mà kiện 2 chưa giao, tự động ưu tiên hiển thị kiện 2
      activeLeg = 'recipient';
    }

    const currentLeg = activeLeg === 'initiator' ? leg1 : leg2;
    const bothDelivered = Boolean(exchange.initiatorReceivedAt && exchange.recipientReceivedAt);

    return {
      exchangeId: exchange._id,
      exchangeStatus: exchange.status,
      activeLeg,
      trackingCode: currentLeg.trackingCode,
      carrierCode: currentLeg.carrierCode,
      carrierName: currentLeg.carrierName,
      status: isWaitingPartner ? 'WAITING_PARTNER_SHIPMENT' : exchange.status,
      readyForPickup: canStartCarrierPickup(exchange, new Date()) ||
        (isBothCreated && exchange.status === 'InTransit') ||
        (isBothCreated && exchange.status === 'Preparing' && Boolean(currentLeg.shippedAt)),
      bothDelivered,
      inspectionDeadline: exchange.inspectionDeadline || null,
      sender: currentLeg.sender,
      receiver: currentLeg.receiver,
      itemsSummary: currentLeg.itemsSummary,
      fee: currentLeg.fee,
      shippedAt: currentLeg.shippedAt,
      deliveredAt: currentLeg.deliveredAt,
      lastEvent: currentLeg.lastEvent,
      legs: [leg1, leg2],
    };
  }

  /**
   * Danh sách các cuộc trao đổi có mã vận chuyển đang hoạt động gần đây để bưu tá chọn nhanh
   * Chỉ lấy tối đa 3 đơn đang trong quá trình giao nhận (InTransit, Preparing, Delivered)
   */
  async getRecentShipmentOrders() {
    if (!this.mongo) return [];
    const exchanges = await this.mongo.c.exchanges
      .find({
        status: { $in: ['InTransit', 'Preparing', 'Delivered'] },
      })
      .sort({ updatedAt: -1 })
      .limit(3)
      .toArray();

    return exchanges.map((ex) => ({
      exchangeId: ex._id,
      status: ex.status,
      updatedAt: ex.updatedAt,
      initiatorTracking: ex.initiatorShipment?.trackingCode,
      recipientTracking: ex.recipientShipment?.trackingCode,
      bothDelivered: Boolean(ex.initiatorReceivedAt && ex.recipientReceivedAt),
    }));
  }

  async resetForDemo() {
    throw invalidState('Dùng phiếu mẫu mới để diễn tập lại. Lịch sử lấy và nhận sách đã ghi được giữ nguyên.');
  }

  /**
   * Tự động chạy mô phỏng nhanh toàn bộ quy trình giao nhận 2 chiều (Dành cho Demo / Thuyết trình)
   * Ghi nhận lấy và giao cả hai kiện trên một phiếu đủ điều kiện.
   */
  async autoSimulateExchange(exchangeId: string) {
    if (!this.mongo) return { success: false, message: 'No Mongo instance' };
    const next = await this.mongo.tx(async (tx) => {
      await tx.lock('exchanges', [exchangeId]);
      const row = await tx.c.exchanges.findOne({ _id: exchangeId });
      if (!row) throw notFound();
      const now = await tx.now();
      if (!hasCarrierLabels(row) || !(canStartCarrierPickup(row, now) || row.status === 'InTransit'))
        throw invalidState('Phiếu cần đủ hai mã vận đơn và còn ở bước giao nhận.');

      const existingDeadlines = inspectionDeadlines(row);
      const deadline = new Date(+now + EXCHANGE_INSPECTION_MS);
      const initiatorDeadline = existingDeadlines.initiator ?? deadline;
      const recipientDeadline = existingDeadlines.recipient ?? deadline;
      const firstPickup = row.initiatorShippedAt ?? now;
      const secondPickup = row.recipientShippedAt ?? now;
      const updated = await tx.c.exchanges.findOneAndUpdate(
        { _id: exchangeId, revision: row.revision },
        {
          $set: {
            status: 'Delivered',
            initiatorShippedAt: firstPickup,
            recipientShippedAt: secondPickup,
            initiatorReceivedAt: row.initiatorReceivedAt ?? now,
            recipientReceivedAt: row.recipientReceivedAt ?? now,
            initiatorInspectionDeadline: initiatorDeadline,
            recipientInspectionDeadline: recipientDeadline,
            inspectionDeadline: new Date(Math.max(+initiatorDeadline, +recipientDeadline)),
            initiatorShipment: { ...row.initiatorShipment, shippedAt: firstPickup, lastEvent: 'Đã giao sách · Demo', lastEventAt: now },
            recipientShipment: { ...row.recipientShipment, shippedAt: secondPickup, lastEvent: 'Đã giao sách · Demo', lastEventAt: now },
            cancellationRequestedBy: null,
            cancellationRequestedAt: null,
            updatedAt: now,
          },
          $inc: { revision: 1 },
        },
        { returnDocument: 'after' },
      );
      if (!updated) throw invalidState();
      await notifyExchange(tx, updated, 'ExchangeReceived', [row.initiatorId, row.recipientId], now);
      return updated;
    });
    return { success: true, status: next.status };
  }

  seedDemoOrder() {
    throw invalidState('Hãy tạo đề nghị và đặt cọc bằng hai tài khoản trước khi mô phỏng giao sách.');
  }
}
