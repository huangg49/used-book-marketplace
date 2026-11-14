import { vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { CarrierSimulatorAdapter } from '../src/modules/shipments/carrier/carrier-simulator.adapter.js';
import { GhnAdapter } from '../src/modules/shipments/carrier/ghn.adapter.js';
import { CarrierService } from '../src/modules/shipments/carrier/carrier.service.js';

describe('Carrier adapters', () => {
  let simAdapter: CarrierSimulatorAdapter;
  let ghnAdapter: GhnAdapter;
  let service: CarrierService;

  beforeEach(() => {
    const config = new ConfigService({
      GHN_TOKEN: 'test-carrier-token',
      GHN_SHOP_ID: '1',
      GHN_API_URL: 'https://carrier.test',
    });
    simAdapter = new CarrierSimulatorAdapter();
    ghnAdapter = new GhnAdapter(config);
    service = new CarrierService(simAdapter, ghnAdapter);
  });

  it('nên tính phí ship 22.000đ cho quận nội thành qua simulator', async () => {
    const fee = await simAdapter.calculateFee(
      { recipientName: 'Nguyễn Đại', phone: '0901234567', detail: 'Quận 1' },
      { recipientName: 'Nguyễn Tú', phone: '0907654321', district: 'Q1', detail: 'Bến Nghé' },
    );
    expect(fee).toBe(22000);
  });

  it('tạo vận đơn mô phỏng ở trạng thái chờ lấy sách', async () => {
    const shipment = await service.createShipment({
      orderId: 'exchange-order-01',
      carrierCode: 'SIMULATOR',
      sender: { recipientName: 'Nguyễn Đại', phone: '0901234567', district: 'Q1', detail: '123 Đinh Tiên Hoàng' },
      receiver: { recipientName: 'Nguyễn Tú', phone: '0907654321', district: 'Q3', detail: '456 Võ Văn Tần' },
    });

    expect(shipment.trackingCode).toMatch(/^DEMO\d+VN$/);
    expect(shipment.fee).toBe(22000);

    const tracking = await service.getTrackingStatus(shipment.trackingCode);
    expect(tracking.status).toBe('READY_TO_PICK');
    expect(tracking.trackingCode).toBe(shipment.trackingCode);
  });

  it('đọc phí vận chuyển từ phản hồi của adapter GHN', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ code: 200, message: 'OK', data: { total: 21750 } }),
    );
    try {
      const fee = await ghnAdapter.calculateFee(
        { recipientName: 'Người gửi', phone: '0000000000', district: 'Q1', detail: 'Địa chỉ thử nghiệm' },
        { recipientName: 'Người nhận', phone: '0000000000', district: 'Q3', detail: 'Địa chỉ thử nghiệm' },
      );

      expect(fee).toBe(21750);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://carrier.test/v2/shipping-order/fee',
        expect.objectContaining({ method: 'POST' }),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('nên cho phép cập nhật trạng thái qua Webhook callback', async () => {
    const shipment = await service.createShipment({
      orderId: 'exchange-order-02',
      sender: { recipientName: 'A', phone: '0901', detail: 'A' },
      receiver: { recipientName: 'B', phone: '0902', detail: 'B' },
    });

    await service.processWebhook({
      trackingCode: shipment.trackingCode,
      status: 'DELIVERED',
      description: 'Giao hàng thành công cho người nhận.',
    });

    const updated = await service.getTrackingStatus(shipment.trackingCode);
    expect(updated.status).toBe('DELIVERED');
    expect(updated.description).toBe('Giao hàng thành công cho người nhận.');
  });
});
