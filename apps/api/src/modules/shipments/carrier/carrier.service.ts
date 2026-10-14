import { Injectable, Logger, Optional } from '@nestjs/common';
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

            if (isInitiatorLeg && !ex.recipientReceivedAt) {
              setFields.recipientReceivedAt = now;
              notifiedUser = ex.initiatorId;
            } else if (isRecipientLeg && !ex.initiatorReceivedAt) {
              setFields.initiatorReceivedAt = now;
              notifiedUser = ex.recipientId;
            }

            const nextInitiatorReceived = isRecipientLeg ? now : (ex.initiatorReceivedAt ?? null);
            const nextRecipientReceived = isInitiatorLeg ? now : (ex.recipientReceivedAt ?? null);
            const willBeBothReceived = Boolean(nextInitiatorReceived && nextRecipientReceived);

            if (willBeBothReceived) {
              const inspectionHours = Number(
                this.config?.get('EXCHANGE_INSPECTION_HOURS') ?? 48,
              );
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
              if (notifiedUser) {
                await notifyExchange(
                  tx,
                  updated,
                  'ExchangeReceived',
                  [notifiedUser],
                  now,
                );
              }
            }
          } else if (statusCode === 'IN_TRANSIT' || statusCode === 'PICKING') {
            if (ex.status === 'Preparing') {
              const willBeBothShipped =
                Boolean(ex.initiatorShippedAt) && Boolean(ex.recipientShippedAt);
              if (willBeBothShipped) {
                const updated = await tx.c.exchanges.findOneAndUpdate(
                  { _id: ex._id, revision: ex.revision, status: 'Preparing' },
                  { $set: { status: 'InTransit', updatedAt: now }, $inc: { revision: 1 } },
                  { returnDocument: 'after' },
                );
                if (updated) {
                  exchangeUpdated = true;
                  nextStatus = updated.status;
                }
              }
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
}
