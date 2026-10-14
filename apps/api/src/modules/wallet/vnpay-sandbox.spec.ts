import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import {
  VNPayCallbackError,
  VNPaySandbox,
  parseVNDate,
  vnDate,
  vnQuery,
  QUERY_RESPONSE_FIELDS,
} from './vnpay-sandbox.js';
import { TransactionPolicy } from './transaction-policy.js';

const config = {
  NODE_ENV: 'test',
  VNPAY_SANDBOX_ENABLED: 'true',
  VNPAY_TMN_CODE: 'TESTDEMO',
  VNPAY_HASH_SECRET: 'qa-only-hmac-key-00000000000000000000',
  VNPAY_RETURN_URL: 'http://127.0.0.1:5174/wallet',
};
describe('VNPay 2.1.0 sandbox adapter', () => {
  const adapter = () => new VNPaySandbox(new ConfigService(config));
  afterEach(() => vi.restoreAllMocks());
  const payment = {
    id: '00000000-0000-4000-8000-000000000001',
    tmnCode: 'TESTDEMO',
    amount: 50000,
    createdAt: new Date('2026-10-13T17:00:00Z'),
  };
  const queryReply = (overrides: Record<string, string> = {}) => {
    const data = {
      vnp_ResponseId: 'query-response-1',
      vnp_Command: 'querydr',
      vnp_ResponseCode: '00',
      vnp_Message: 'Success',
      vnp_TmnCode: payment.tmnCode,
      vnp_TxnRef: payment.id,
      vnp_Amount: '5000000',
      vnp_BankCode: 'NCB',
      vnp_PayDate: '20261014000100',
      vnp_TransactionNo: '12345',
      vnp_TransactionType: '01',
      vnp_TransactionStatus: '00',
      vnp_OrderInfo: 'Nap vi',
      ...overrides,
    };
    return {
      ...data,
      vnp_SecureHash: createHmac('sha512', config.VNPAY_HASH_SECRET)
        .update(
          QUERY_RESPONSE_FIELDS.map(
            (field) => (data as Record<string, string>)[field] ?? '',
          ).join('|'),
        )
        .digest('hex'),
    };
  };
  it('signs an outbound QueryDR request and accepts only authenticated matching payment evidence', async () => {
    const transport = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(queryReply())));
    expect(await adapter().queryPayment(payment)).toMatchObject({
      vnp_Amount: '5000000',
      vnp_TransactionStatus: '00',
    });
    const [url, init] = transport.mock.calls[0];
    expect(url).toBe(
      'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction',
    );
    const body = JSON.parse(String(init?.body));
    const fields = [
      'vnp_RequestId',
      'vnp_Version',
      'vnp_Command',
      'vnp_TmnCode',
      'vnp_TxnRef',
      'vnp_TransactionDate',
      'vnp_CreateDate',
      'vnp_IpAddr',
      'vnp_OrderInfo',
    ];
    expect(body.vnp_SecureHash).toBe(
      createHmac('sha512', config.VNPAY_HASH_SECRET)
        .update(fields.map((f) => body[f]).join('|'))
        .digest('hex'),
    );
    expect(body.vnp_TransactionDate).toBe('20261014000000');
    expect(init?.redirect).toBe('error');
  });
  const invalidQueryCases: Record<string, string>[] = [
    { vnp_TmnCode: 'OTHERDEM' },
    { vnp_TxnRef: '00000000-0000-4000-8000-000000000002' },
    { vnp_Amount: '6000000' },
    { vnp_TransactionType: '02' },
    { vnp_Command: 'refund' },
    { vnp_ResponseCode: '91' },
    { vnp_TransactionNo: '0' },
    { vnp_PayDate: '20260231000000' },
  ];
  it.each(invalidQueryCases)(
    'rejects signed QueryDR evidence with mismatched or invalid fields %j',
    async (overrides) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(queryReply(overrides))),
      );
      await expect(adapter().queryPayment(payment)).rejects.toMatchObject({
        status: 503,
      });
    },
  );
  it('does not treat successful query acknowledgements for pending/failed transactions as paid', async () => {
    const transport = vi.spyOn(globalThis, 'fetch');
    for (const status of ['01', '02', '05']) {
      transport.mockResolvedValueOnce(
        new Response(
          JSON.stringify(queryReply({ vnp_TransactionStatus: status })),
        ),
      );
      expect(await adapter().queryPayment(payment)).toBeNull();
    }
  });
  it('fails closed for forged/unsigned responses, malformed JSON and transport failures', async () => {
    const transport = vi.spyOn(globalThis, 'fetch');
    for (const body of [
      { ...queryReply(), vnp_SecureHash: '0'.repeat(128) },
      { vnp_ResponseCode: '00' },
      [],
    ]) {
      transport.mockResolvedValueOnce(new Response(JSON.stringify(body)));
      await expect(adapter().queryPayment(payment)).rejects.toMatchObject({
        status: 503,
      });
    }
    transport.mockResolvedValueOnce(new Response('not-json'));
    await expect(adapter().queryPayment(payment)).rejects.toMatchObject({
      status: 503,
    });
    transport.mockRejectedValueOnce(new Error('provider unavailable'));
    await expect(adapter().queryPayment(payment)).rejects.toMatchObject({
      status: 503,
    });
  });
  it('sorts and form-encodes fields and formats Vietnam wall time', () => {
    expect(vnQuery({ z: 'a b+!', a: ':/é' })).toBe(
      'a=%3A%2F%C3%A9&z=a+b%2B%21',
    );
    expect(vnDate(new Date('2026-10-13T17:00:00Z'))).toBe('20261014000000');
    expect(parseVNDate('20261014000000').toISOString()).toBe(
      '2026-10-13T17:00:00.000Z',
    );
    expect(() => parseVNDate('20260231000000')).toThrow();
  });
  it('creates a signed sandbox URL with integer VND x100 and the pinned expiry', () => {
    const a = adapter();
    const result = a.checkout(
      '00000000-0000-4000-8000-000000000001',
      50000,
      new Date('2026-10-13T17:00:00Z'),
      new Date('2026-10-13T17:15:00Z'),
      '::ffff:127.0.0.1',
    );
    const url = new URL(result.paymentUrl);
    expect(url.origin).toBe('https://sandbox.vnpayment.vn');
    expect(url.searchParams.get('vnp_Amount')).toBe('5000000');
    expect(url.searchParams.get('vnp_CreateDate')).toBe('20261014000000');
    expect(url.searchParams.get('vnp_ExpireDate')).toBe('20261014001500');
    expect(url.searchParams.get('vnp_IpAddr')).toBe('127.0.0.1');
    const signature = url.searchParams.get('vnp_SecureHash');
    url.searchParams.delete('vnp_SecureHash');
    expect(signature).toBe(
      createHmac('sha512', config.VNPAY_HASH_SECRET)
        .update(url.searchParams.toString())
        .digest('hex'),
    );
  });
  it('rejects forged and duplicate query values, including replayed callbacks', () => {
    const a = adapter();
    expect(() =>
      a.verify({ vnp_Amount: '5000000', vnp_SecureHash: '0'.repeat(128) }),
    ).toThrow(VNPayCallbackError);
    expect(() => a.verify({ vnp_Amount: ['5000000', '1000000'] })).toThrow(
      VNPayCallbackError,
    );
  });
  it('fails closed in production and for invalid merchant configuration', () => {
    expect(() =>
      new VNPaySandbox(
        new ConfigService({ ...config, NODE_ENV: 'production' }),
      ).onModuleInit(),
    ).toThrow();
    expect(() =>
      new VNPaySandbox(
        new ConfigService({
          ...config,
          VNPAY_RETURN_URL:
            'https://example.com/wallet?next=https://other.test',
        }),
      ).onModuleInit(),
    ).toThrow();
  });
  it('defaults to 20000 VND and atomic wallet checkout; legacy mode is explicit', () => {
    expect(new TransactionPolicy(new ConfigService({}))).toMatchObject({
      listingFee: 20000,
      atomicCheckout: true,
    });
    expect(
      new TransactionPolicy(
        new ConfigService({
          LISTING_SUBMISSION_FEE_VND: '0',
          ORDER_CHECKOUT_MODE: 'Unpaid',
        }),
      ),
    ).toMatchObject({ listingFee: 0, atomicCheckout: false });
    expect(
      () =>
        new TransactionPolicy(
          new ConfigService({ LISTING_SUBMISSION_FEE_VND: '-1' }),
        ),
    ).toThrow();
  });
});
