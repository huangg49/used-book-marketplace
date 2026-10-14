import { Injectable, Logger } from '@nestjs/common';
import type {
  CarrierAddress,
  CarrierStatus,
  CarrierStatusCode,
  ICarrierAdapter,
  ShipmentOrderInput,
} from './carrier.interface.js';

interface StoredShipment {
  trackingCode: string;
  orderId: string;
  carrier: string;
  fee: number;
  status: CarrierStatusCode;
  description: string;
  updatedAt: Date;
  sender: CarrierAddress;
  receiver: CarrierAddress;
}

@Injectable()
export class CarrierSimulatorAdapter implements ICarrierAdapter {
  readonly carrierCode = 'SIMULATOR';
  readonly carrierName = 'Bộ Mô Phỏng Chuyển Phát TP.HCM (LatLai Carrier)';
  private readonly logger = new Logger(CarrierSimulatorAdapter.name);

  // Bộ nhớ đệm lưu trữ các đơn đã tạo trong phiên chạy
  private readonly shipments = new Map<string, StoredShipment>();

  private readonly innerDistricts = new Set([
    'QUAN_1', 'QUAN_3', 'QUAN_4', 'QUAN_5', 'QUAN_6', 'QUAN_7', 'QUAN_8',
    'QUAN_10', 'QUAN_11', 'BINH_THANH', 'PHU_NHUAN', 'GO_VAP', 'TAN_BINH', 'TAN_PHU',
    'Q1', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q10', 'Q11', 'BT', 'PN', 'GV', 'TB', 'TP',
  ]);

  async calculateFee(fromAddress: CarrierAddress, toAddress: CarrierAddress): Promise<number> {
    const toDistrict = (toAddress.district || '').toUpperCase().trim();
    // Nếu giao nội thành TP.HCM: 22.000 đ, ngoại thành hoặc liên quận xa: 30.000 đ
    if (this.innerDistricts.has(toDistrict)) {
      return 22000;
    }
    return 30000;
  }

  async createShipment(order: ShipmentOrderInput): Promise<{ trackingCode: string; fee: number }> {
    const fee = await this.calculateFee(order.sender, order.receiver);

    // Tự sinh mã vận đơn giả lập theo định dạng chuẩn GHN
    const prefix = order.carrierCode === 'GHTK' ? 'GHTK' : 'GHN';
    const timestampSuffix = Date.now().toString().slice(-6);
    const rand = Math.floor(Math.random() * 900 + 100);
    const trackingCode = `${prefix}${timestampSuffix}${rand}VN`;

    const stored: StoredShipment = {
      trackingCode,
      orderId: order.orderId,
      carrier: this.carrierName,
      fee,
      status: 'IN_TRANSIT',
      description: 'Bưu tá đã lấy hàng thành công tại điểm gửi. Đang trung chuyển qua bưu cục TP.HCM.',
      updatedAt: new Date(),
      sender: order.sender,
      receiver: order.receiver,
    };

    this.shipments.set(trackingCode, stored);
    this.logger.log(`[CarrierSimulator] Đã tạo vận đơn mới: ${trackingCode} (Đơn hàng: ${order.orderId}, Cước phí: ${fee}đ)`);

    return { trackingCode, fee };
  }

  async getTrackingStatus(trackingCode: string): Promise<CarrierStatus> {
    const existing = this.shipments.get(trackingCode);
    if (!existing) {
      return {
        trackingCode,
        status: 'IN_TRANSIT',
        carrier: this.carrierName,
        updatedAt: new Date(),
        description: 'Bưu phẩm đang được vận chuyển trên tuyến đường bưu chính.',
      };
    }

    return {
      trackingCode: existing.trackingCode,
      status: existing.status,
      carrier: existing.carrier,
      updatedAt: existing.updatedAt,
      description: existing.description,
    };
  }

  // Hàm mô phỏng cập nhật trạng thái từ Webhook hoặc kịch bản kiểm thử
  setShipmentStatus(trackingCode: string, status: CarrierStatusCode, description?: string): boolean {
    const existing = this.shipments.get(trackingCode);
    if (!existing) return false;

    existing.status = status;
    existing.updatedAt = new Date();
    if (description) existing.description = description;

    this.logger.log(`[CarrierSimulator] Cập nhật trạng thái ${trackingCode} ➔ ${status}`);
    return true;
  }
}
