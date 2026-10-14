import { ConfigService } from '@nestjs/config';
import { CarrierSimulatorAdapter } from '../src/modules/shipments/carrier/carrier-simulator.adapter.js';
import { GhnAdapter } from '../src/modules/shipments/carrier/ghn.adapter.js';
import { CarrierService } from '../src/modules/shipments/carrier/carrier.service.js';

describe('Carrier Adapter Pattern & GHN Integration (Giai đoạn 2 & 3)', () => {
  let simAdapter: CarrierSimulatorAdapter;
  let ghnAdapter: GhnAdapter;
  let service: CarrierService;

  beforeEach(() => {
    const config = new ConfigService({
      GHN_TOKEN: 'd61786d4-d311-40ea-a1f1-a137b38fa3ff',
      GHN_SHOP_ID: '6721299',
      GHN_API_URL: 'https://online-gateway.ghn.vn/shiip/public-api',
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

  it('nên tạo vận đơn với mã GHN và trạng thái ban đầu IN_TRANSIT', async () => {
    const shipment = await service.createShipment({
      orderId: 'exchange-order-01',
      carrierCode: 'SIMULATOR',
      sender: { recipientName: 'Nguyễn Đại', phone: '0901234567', district: 'Q1', detail: '123 Đinh Tiên Hoàng' },
      receiver: { recipientName: 'Nguyễn Tú', phone: '0907654321', district: 'Q3', detail: '456 Võ Văn Tần' },
    });

    expect(shipment.trackingCode).toMatch(/^GHN\d+VN$/);
    expect(shipment.fee).toBe(22000);

    const tracking = await service.getTrackingStatus(shipment.trackingCode);
    expect(tracking.status).toBe('IN_TRANSIT');
    expect(tracking.trackingCode).toBe(shipment.trackingCode);
  });

  it('nên gọi API GHN thật để tính phí thời gian thực', async () => {
    const fee = await ghnAdapter.calculateFee(
      { recipientName: 'Nguyễn Đại', phone: '0394644041', district: 'Q1', detail: '123 Nguyễn Thái Bình' },
      { recipientName: 'Nguyễn Tú', phone: '0907654321', district: 'Q3', detail: '456 Võ Văn Tần' },
    );

    // GHN trả về cước chuẩn (khoảng 21.000đ - 22.000đ)
    expect(fee).toBeGreaterThan(15000);
    expect(fee).toBeLessThan(35000);
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
