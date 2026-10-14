export interface CarrierAddress {
  recipientName: string;
  phone: string;
  province?: string;      // Tỉnh/Thành phố (Mặc định: TP. Hồ Chí Minh)
  district?: string;      // Quận/Huyện (hoặc localityCode)
  ward?: string;          // Phường/Xã
  detail: string;         // Số nhà, tên đường
}

export interface ShipmentOrderInput {
  orderId: string;
  carrierCode?: 'GHN' | 'GHTK' | 'VIETTELPOST' | 'SIMULATOR';
  sender: CarrierAddress;
  receiver: CarrierAddress;
  weightGrams?: number;
  itemsSummary?: string;
  notes?: string;
}

export type CarrierStatusCode =
  | 'READY_TO_PICK'
  | 'PICKING'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'RETURN'
  | 'CANCELLED';

export interface CarrierStatus {
  trackingCode: string;
  status: CarrierStatusCode;
  carrier: string;
  updatedAt: Date;
  description: string;
}

/**
 * Interface chuẩn hóa Adapter Pattern dùng chung cho GHN, GHTK, Viettel Post hoặc Bộ mô phỏng.
 */
export interface ICarrierAdapter {
  readonly carrierCode: string;
  readonly carrierName: string;

  /**
   * Tính phí ship giữa 2 địa chỉ
   */
  calculateFee(fromAddress: CarrierAddress, toAddress: CarrierAddress): Promise<number>;

  /**
   * Đẩy đơn sang bưu cục / tạo vận đơn
   */
  createShipment(order: ShipmentOrderInput): Promise<{ trackingCode: string; fee: number }>;

  /**
   * Kiểm tra trạng thái đơn hàng theo mã vận đơn
   */
  getTrackingStatus(trackingCode: string): Promise<CarrierStatus>;
}
