import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { MongoService } from '../../../database/mongo/mongo.service.js';
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

  /**
   * Xử lý webhook cập nhật trạng thái bưu kiện từ GHN/GHTK hoặc Simulator
   * Tự động cập nhật receivedAt và kích hoạt mốc nghiệm thu 48h khi giao thành công (DELIVERED)
   */
  async processWebhook(event: {
    trackingCode: string;
    status: string;
    description?: string;
  }): Promise<{
    success: boolean;
    trackingCode: string;
    exchangeUpdated?: boolean;
    nextStatus?: string;
  }> {
    this.logger.log(`[CarrierWebhook] Nhận sự kiện cho mã ${event.trackingCode}: ${event.status}`);

    const statusCode: CarrierStatusCode =
      event.status === 'DELIVERED'
        ? 'DELIVERED'
        : event.status === 'PICKING'
          ? 'PICKING'
          : event.status === 'READY_TO_PICK'
            ? 'READY_TO_PICK'
            : 'IN_TRANSIT';

    if (this.simulatorAdapter) {
      this.simulatorAdapter.setShipmentStatus(event.trackingCode, statusCode, event.description);
    }
    if (this.ghnAdapter) {
      this.ghnAdapter.setShipmentStatus(event.trackingCode, statusCode, event.description);
    }

    let exchangeUpdated = false;
    let nextStatus: string | undefined;

    if (this.mongo) {
      try {
        await this.mongo.tx(async (tx) => {
          const exchange = await tx.c.exchanges.findOne({
            $or: [
              { 'initiatorShipment.trackingCode': event.trackingCode },
              { 'recipientShipment.trackingCode': event.trackingCode },
            ],
          });

          if (!exchange) return;

          await tx.lock('exchanges', [exchange._id]);
          const ex = await tx.c.exchanges.findOne({ _id: exchange._id });
          if (!ex || ex.status === 'Cancelled' || ex.status === 'Completed') {
            return;
          }

          const now = await tx.now();
          const isInitiatorLeg = ex.initiatorShipment?.trackingCode === event.trackingCode;
          const isRecipientLeg = ex.recipientShipment?.trackingCode === event.trackingCode;

          if (statusCode === 'DELIVERED') {
            const setFields: Record<string, unknown> = { updatedAt: now };
            let notifiedUser: string | null = null;

            if (event.description) {
              if (isInitiatorLeg) {
                setFields['initiatorShipment.lastEvent'] = event.description;
                setFields['initiatorShipment.lastEventAt'] = now;
              } else if (isRecipientLeg) {
                setFields['recipientShipment.lastEvent'] = event.description;
                setFields['recipientShipment.lastEventAt'] = now;
              }
            }

            const inspectionHours = Math.max(
              Number(this.config?.get('EXCHANGE_INSPECTION_HOURS') ?? 72),
              72,
            );

            if (isInitiatorLeg && !ex.recipientReceivedAt) {
              setFields.recipientReceivedAt = now;
              setFields.recipientInspectionDeadline = new Date(
                now.getTime() + inspectionHours * 3_600_000,
              );
            } else if (isRecipientLeg && !ex.initiatorReceivedAt) {
              setFields.initiatorReceivedAt = now;
              setFields.initiatorInspectionDeadline = new Date(
                now.getTime() + inspectionHours * 3_600_000,
              );
            }

            const nextInitiatorReceived = isRecipientLeg ? now : (ex.initiatorReceivedAt ?? null);
            const nextRecipientReceived = isInitiatorLeg ? now : (ex.recipientReceivedAt ?? null);
            const willBeBothReceived = Boolean(nextInitiatorReceived && nextRecipientReceived);

            if (willBeBothReceived) {
              setFields.status = 'Delivered';
              setFields.inspectionDeadline = new Date(
                now.getTime() + inspectionHours * 3_600_000,
              );
            }

            const updated = await tx.c.exchanges.findOneAndUpdate(
              { _id: ex._id, revision: ex.revision },
              { $set: setFields, $inc: { revision: 1 } },
              { returnDocument: 'after' },
            );

            if (updated) {
              exchangeUpdated = true;
              nextStatus = updated.status;
              this.logger.log(
                `[CarrierWebhook] Đã tự động cập nhật Exchange ${updated._id} sang ${updated.status} (receivedAt=${now.toISOString()}) theo sự kiện DELIVERED từ bưu tá.`,
              );
              await notifyExchange(
                tx,
                updated,
                'ExchangeReceived',
                [ex.initiatorId, ex.recipientId],
                now,
              );
            }
          } else if (statusCode === 'IN_TRANSIT' || statusCode === 'PICKING') {
            const setFields: Record<string, unknown> = { updatedAt: now };

            if (event.description) {
              if (isInitiatorLeg) {
                setFields['initiatorShipment.lastEvent'] = event.description;
                setFields['initiatorShipment.lastEventAt'] = now;
              } else if (isRecipientLeg) {
                setFields['recipientShipment.lastEvent'] = event.description;
                setFields['recipientShipment.lastEventAt'] = now;
              }
            }

            if (statusCode === 'PICKING') {
              if (isInitiatorLeg && !ex.initiatorShippedAt) {
                setFields.initiatorShippedAt = now;
                setFields['initiatorShipment.shippedAt'] = now;
              }
              if (isRecipientLeg && !ex.recipientShippedAt) {
                setFields.recipientShippedAt = now;
                setFields['recipientShipment.shippedAt'] = now;
              }
            }

            if (ex.status === 'Preparing') {
              const willBeBothShipped =
                Boolean(isInitiatorLeg ? now : ex.initiatorShippedAt) &&
                Boolean(isRecipientLeg ? now : ex.recipientShippedAt);
              if (willBeBothShipped) {
                setFields.status = 'InTransit';
              }
            }

            const updated = await tx.c.exchanges.findOneAndUpdate(
              { _id: ex._id, revision: ex.revision },
              { $set: setFields, $inc: { revision: 1 } },
              { returnDocument: 'after' },
            );
            if (updated) {
              exchangeUpdated = true;
              nextStatus = updated.status;
            }
          }
        });
      } catch (err) {
        this.logger.error(
          `[CarrierWebhook] Lỗi khi cập nhật trạng thái Exchange qua Webhook: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return { success: true, trackingCode: event.trackingCode, exchangeUpdated, nextStatus };
  }

  private async getBookTitle(listingId?: string): Promise<string | null> {
    if (!listingId || !this.mongo) return null;
    try {
      const listing = await this.mongo.c.listings.findOne({ _id: listingId });
      const rev = listing?.currentRevisionId
        ? await this.mongo.c.listing_revisions.findOne({ _id: listing.currentRevisionId })
        : null;
      if (rev?.bookId) {
        const catRev = await this.mongo.c.catalog_revisions.findOne(
          { bookId: rev.bookId },
          { sort: { number: -1 } },
        );
        return catRev?.title ?? null;
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
          $or: [
            { 'initiatorShipment.trackingCode': { $exists: true, $ne: null } },
            { 'recipientShipment.trackingCode': { $exists: true, $ne: null } },
          ],
        },
        { sort: { updatedAt: -1 } },
      );

      // 2. Đơn đang chuẩn bị (Preparing)
      if (!exchange) {
        exchange = await this.mongo.c.exchanges.findOne(
          {
            status: 'Preparing',
            $or: [
              { 'initiatorShipment.trackingCode': { $exists: true, $ne: null } },
              { 'recipientShipment.trackingCode': { $exists: true, $ne: null } },
            ],
          },
          { sort: { updatedAt: -1 } },
        );
      }

      // 3. Fallback: Đơn có mã vận chuyển gần nhất để không bị kẹt màn hình trống
      if (!exchange) {
        exchange = await this.mongo.c.exchanges.findOne(
          {
            $or: [
              { 'initiatorShipment.trackingCode': { $exists: true, $ne: null } },
              { 'recipientShipment.trackingCode': { $exists: true, $ne: null } },
            ],
          },
          { sort: { updatedAt: -1 } },
        );
      }
    }

    if (!exchange) return null;

    const isBothCreated =
      Boolean(exchange.initiatorShipment?.trackingCode) &&
      Boolean(exchange.recipientShipment?.trackingCode);

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
      trackingCode: exchange.initiatorShipment?.trackingCode || 'GHN_A_PENDING',
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
      itemsSummary: bookTitleA ? `Sách gửi: "${bookTitleA}"` : 'Bưu phẩm sách trao đổi',
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
      trackingCode: exchange.recipientShipment?.trackingCode || 'GHN_B_PENDING',
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
      itemsSummary: bookTitleB ? `Sách gửi: "${bookTitleB}"` : 'Bưu phẩm sách trao đổi',
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
      readyForPickup: !isWaitingPartner,
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
        $or: [
          { 'initiatorShipment.trackingCode': { $exists: true, $ne: null } },
          { 'recipientShipment.trackingCode': { $exists: true, $ne: null } },
        ],
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

  /**
   * Đặt lại trạng thái đơn trao đổi về InTransit để phục vụ demo / test lặp lại
   */
  async resetForDemo(exchangeId: string) {
    if (!this.mongo) return { success: false, message: 'No Mongo instance' };
    const now = new Date();
    const result = await this.mongo.c.exchanges.findOneAndUpdate(
      { _id: exchangeId },
      {
        $set: {
          status: 'InTransit',
          initiatorShippedAt: now,
          recipientShippedAt: now,
          initiatorReceivedAt: null,
          recipientReceivedAt: null,
          initiatorInspectionDeadline: null,
          recipientInspectionDeadline: null,
          inspectionDeadline: null,
          'initiatorShipment.lastEvent': null,
          'initiatorShipment.lastEventAt': null,
          'recipientShipment.lastEvent': null,
          'recipientShipment.lastEventAt': null,
          updatedAt: now,
        },
      },
      { returnDocument: 'after' },
    );
    return { success: Boolean(result), exchange: result };
  }

  /**
   * Tự động chạy mô phỏng nhanh toàn bộ quy trình giao nhận 2 chiều (Dành cho Demo / Thuyết trình)
   * Tự động hoàn tất cả 2 kiện hàng và kích hoạt mốc nghiệm thu 48h trên sàn Lật Lại
   */
  async autoSimulateExchange(exchangeId: string) {
    if (!this.mongo) return { success: false, message: 'No Mongo instance' };
    let updatedExchange: any = null;

    await this.mongo.tx(async (tx) => {
      const ex = await tx.c.exchanges.findOne({ _id: exchangeId });
      if (!ex) return;
      await tx.lock('exchanges', [ex._id]);

      const now = await tx.now();
      const inspectionHours = Math.max(
        Number(this.config?.get('EXCHANGE_INSPECTION_HOURS') ?? 72),
        72,
      );
      const deadline = new Date(now.getTime() + inspectionHours * 3_600_000);

      const trackingA = ex.initiatorShipment?.trackingCode || `GHN${Math.floor(100000000 + Math.random() * 900000000)}VN`;
      const trackingB = ex.recipientShipment?.trackingCode || `GHN${Math.floor(100000000 + Math.random() * 900000000)}VN`;

      const setFields: Record<string, unknown> = {
        status: 'Delivered',
        initiatorShippedAt: ex.initiatorShippedAt || now,
        recipientShippedAt: ex.recipientShippedAt || now,
        initiatorReceivedAt: now,
        recipientReceivedAt: now,
        initiatorInspectionDeadline: deadline,
        recipientInspectionDeadline: deadline,
        inspectionDeadline: deadline,
        'initiatorShipment.lastEvent': `Giao kiện ${trackingA} tận tay thành công kèm ký nhận POD`,
        'initiatorShipment.lastEventAt': now,
        'recipientShipment.lastEvent': `Giao kiện ${trackingB} tận tay thành công kèm ký nhận POD`,
        'recipientShipment.lastEventAt': now,
        updatedAt: now,
      };

      const updated = await tx.c.exchanges.findOneAndUpdate(
        { _id: ex._id, revision: ex.revision },
        { $set: setFields, $inc: { revision: 1 } },
        { returnDocument: 'after' },
      );

      if (updated) {
        updatedExchange = updated;
        await notifyExchange(
          tx,
          updated,
          'ExchangeReceived',
          [ex.initiatorId, ex.recipientId],
          now,
        );
      }
    });

    return { success: Boolean(updatedExchange), exchange: updatedExchange };
  }

  /**
   * Tạo nhanh đơn trao đổi mẫu (Seed Demo Order) để phục vụ test ngay khi DB trống
   */
  async seedDemoOrder() {
    if (!this.mongo) return { success: false, message: 'No Mongo instance' };

    let createdId: string | null = null;
    let createdTracking: string | null = null;

    await this.mongo.tx(async (tx) => {
      // Tìm 2 user thực tế trong hệ thống
      const users = await tx.c.users.find({}).limit(4).toArray();
      const userA = users[0] || {
        _id: randomUUID(),
        displayName: 'Nguyễn Đại (Bên A)',
        username: 'nguyendai',
      };
      const userB = users[1] || {
        _id: randomUUID(),
        displayName: 'Trần Tú (Bên B)',
        username: 'trantu',
      };

      // Tìm 2 listing sách
      const listings = await tx.c.listings.find({}).limit(2).toArray();
      const listingAId = listings[0]?._id || randomUUID();
      const listingBId = listings[1]?._id || randomUUID();

      const trackingA = `GHN${Math.floor(100000000 + Math.random() * 900000000)}VN`;
      const trackingB = `GHN${Math.floor(100000000 + Math.random() * 900000000)}VN`;
      const now = await tx.now();
      const newId = randomUUID();

      const newExchange: any = {
        _id: newId,
        initiatorId: userA._id,
        recipientId: userB._id,
        initiatorListingId: listingAId,
        initiatorListingIds: [listingAId],
        recipientListingId: listingBId,
        status: 'InTransit',
        revision: 1,
        initiatorDeposit: 50000,
        recipientDeposit: 50000,
        diffAmount: 0,
        diffPayerId: null,
        initiatorOrderId: randomUUID(),
        recipientOrderId: randomUUID(),
        fundingDeadline: null,
        initiatorFundedAt: now,
        recipientFundedAt: now,
        proposalExpiresAt: null,
        rejectionReason: null,
        cancelReason: null,
        cancelledBy: null,
        cancelledAt: null,
        shippingDeadline: null,
        initiatorShippedAt: now,
        recipientShippedAt: now,
        initiatorReceivedAt: null,
        recipientReceivedAt: null,
        initiatorInspectionDeadline: null,
        recipientInspectionDeadline: null,
        inspectionDeadline: null,
        completedAt: null,
        initiatorCompletedAt: null,
        recipientCompletedAt: null,
        disputedAt: null,
        disputeReason: null,
        disputedBy: null,
        resolutionDecision: null,
        resolutionReason: null,
        resolvedBy: null,
        resolvedAt: null,
        cancellationRequestedBy: null,
        cancellationRequestedAt: null,
        lastProposedById: null,
        initiatorAddress: {
          recipientName: userA.displayName || 'Nguyễn Đại (Bên A)',
          phone: '0901234567',
          detail: '123 Nguyễn Huệ, P. Bến Nghé, Quận 1',
          localityCode: 'DEMO-A',
          serviceAreaCode: 'HCM-DEMO-v1',
        },
        recipientAddress: {
          recipientName: userB.displayName || 'Trần Tú (Bên B)',
          phone: '0373916690',
          detail: '120 Yên Lãng, Đống Đa, TP.HCM',
          localityCode: 'DEMO-B',
          serviceAreaCode: 'HCM-DEMO-v1',
        },
        initiatorShipment: {
          method: 'carrier',
          carrierCode: 'GHN',
          carrierName: 'Giao Hàng Nhanh (GHN Express)',
          trackingCode: trackingA,
          meetupLocation: null,
          notes: null,
          shippedAt: now,
          lastEvent: 'Bưu tá Lê Hoàng Nam đã tiếp nhận kiện sách tại bưu cục TP.HCM',
          lastEventAt: now,
        },
        recipientShipment: {
          method: 'carrier',
          carrierCode: 'GHN',
          carrierName: 'Giao Hàng Nhanh (GHN Express)',
          trackingCode: trackingB,
          meetupLocation: null,
          notes: null,
          shippedAt: now,
          lastEvent: 'Bưu tá Lê Hoàng Nam đã tiếp nhận kiện sách tại bưu cục TP.HCM',
          lastEventAt: now,
        },
        createdAt: now,
        updatedAt: now,
        lockSeq: 0,
      };

      await tx.c.exchanges.insertOne(newExchange);
      createdId = newId;
      createdTracking = trackingA;
    });

    return {
      success: Boolean(createdId),
      exchangeId: createdId,
      trackingCode: createdTracking,
    };
  }
}
