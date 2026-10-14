import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { DomainError } from '../commands/domain-error.js';

export const VNPAY_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
const QUERY_URL =
  'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction';
export const QUERY_RESPONSE_FIELDS = [
  'vnp_ResponseId',
  'vnp_Command',
  'vnp_ResponseCode',
  'vnp_Message',
  'vnp_TmnCode',
  'vnp_TxnRef',
  'vnp_Amount',
  'vnp_BankCode',
  'vnp_PayDate',
  'vnp_TransactionNo',
  'vnp_TransactionType',
  'vnp_TransactionStatus',
  'vnp_OrderInfo',
  'vnp_PromotionCode',
  'vnp_PromotionAmount',
] as const;
export function vnDate(date: Date): string {
  return new Date(date.getTime() + 7 * 3600000)
    .toISOString()
    .slice(0, 19)
    .replace(/[-T:]/g, '');
}
export function parseVNDate(value: string): Date {
  if (!/^\d{14}$/.test(value)) throw new Error('Invalid provider date');
  const date = new Date(
    `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}+07:00`,
  );
  if (!Number.isFinite(date.getTime()) || vnDate(date) !== value)
    throw new Error('Invalid provider date');
  return date;
}
// Mirrors VNPay 2.1.0 form encoding, including + for spaces; no HashType in 2.1.0.
export function vnQuery(params: Record<string, string>): string {
  const encode = (s: string) =>
    encodeURIComponent(s)
      .replace(/%20/g, '+')
      .replace(
        /[!'()*]/g,
        (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
      );
  return Object.keys(params)
    .sort()
    .map((k) => `${encode(k)}=${encode(params[k])}`)
    .join('&');
}
export class VNPayCallbackError extends Error {
  constructor(
    readonly code: '97' | '04',
    message: string,
  ) {
    super(message);
  }
}
@Injectable()
export class VNPaySandbox implements OnModuleInit {
  constructor(private readonly config: ConfigService) {}
  enabled() {
    return this.config.get<string>('VNPAY_SANDBOX_ENABLED') === 'true';
  }
  onModuleInit() {
    if (this.enabled()) this.settings();
  }
  private settings() {
    if (!this.enabled())
      throw new DomainError(
        503,
        'UNAVAILABLE',
        'Nạp ví qua VNPay sandbox chưa được cấu hình.',
      );
    if (this.config.get('NODE_ENV') === 'production')
      throw new Error('VNPay sandbox cannot run in production');
    const tmnCode = this.config.get<string>('VNPAY_TMN_CODE', '');
    const secret = this.config.get<string>('VNPAY_HASH_SECRET', '');
    const returnUrl = this.config.get<string>('VNPAY_RETURN_URL', '');
    const url = new URL(returnUrl);
    if (
      !/^[A-Za-z0-9]{8}$/.test(tmnCode) ||
      secret.length < 16 ||
      returnUrl.length > 255 ||
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      !(
        url.protocol === 'https:' ||
        (url.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      )
    )
      throw new Error(
        'Invalid VNPay sandbox merchant/secret/return URL configuration',
      );
    return { tmnCode, secret, returnUrl };
  }
  sign(params: Record<string, string>) {
    return createHmac('sha512', this.settings().secret)
      .update(vnQuery(params))
      .digest('hex');
  }
  checkout(
    id: string,
    amount: number,
    createdAt: Date,
    expiresAt: Date,
    ip: string,
  ) {
    const { tmnCode, returnUrl } = this.settings();
    const normalizedIp = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    const params = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: tmnCode,
      vnp_Amount: String(amount * 100),
      vnp_CurrCode: 'VND',
      vnp_TxnRef: id,
      vnp_OrderInfo: `Nap vi Lat lai ${id}`,
      vnp_OrderType: 'other',
      vnp_Locale: 'vn',
      vnp_CreateDate: vnDate(createdAt),
      vnp_ExpireDate: vnDate(expiresAt),
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: isIP(normalizedIp) ? normalizedIp : '127.0.0.1',
    };
    return {
      tmnCode,
      paymentUrl: `${VNPAY_URL}?${vnQuery(params)}&vnp_SecureHash=${this.sign(params)}`,
    };
  }
  verify(raw: unknown) {
    const { tmnCode } = this.settings();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new VNPayCallbackError('97', 'Invalid callback');
    const params: Record<string, string> = {};
    const entries = Object.entries(raw);
    if (entries.length > 32)
      throw new VNPayCallbackError('97', 'Invalid callback');
    for (const [key, value] of entries) {
      if (
        !key.startsWith('vnp_') ||
        typeof value !== 'string' ||
        value.length > 1000
      )
        throw new VNPayCallbackError('97', 'Invalid callback');
      if (!['vnp_SecureHash', 'vnp_SecureHashType'].includes(key))
        params[key] = value;
    }
    const signature = (raw as Record<string, unknown>).vnp_SecureHash;
    if (
      typeof signature !== 'string' ||
      !/^[a-fA-F0-9]{128}$/.test(signature) ||
      !timingSafeEqual(
        Buffer.from(this.sign(params), 'hex'),
        Buffer.from(signature, 'hex'),
      ) ||
      params.vnp_TmnCode !== tmnCode
    )
      throw new VNPayCallbackError('97', 'Invalid signature');
    if (
      !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(
        params.vnp_TxnRef ?? '',
      ) ||
      !/^\d{2}$/.test(params.vnp_ResponseCode ?? '') ||
      !/^\d{2}$/.test(params.vnp_TransactionStatus ?? '') ||
      !/^\d{1,32}$/.test(params.vnp_TransactionNo ?? '')
    )
      throw new VNPayCallbackError('97', 'Invalid signed callback');
    if (params.vnp_CurrCode && params.vnp_CurrCode !== 'VND')
      throw new VNPayCallbackError('97', 'Invalid currency');
    if (
      !/^\d{1,12}$/.test(params.vnp_Amount ?? '') ||
      Number(params.vnp_Amount) % 100 !== 0
    )
      throw new VNPayCallbackError('04', 'Invalid amount');
    return params;
  }

  async queryPayment(payment: {
    id: string;
    tmnCode: string;
    amount: number;
    createdAt: Date;
  }): Promise<Record<string, string> | null> {
    const settings = this.settings();
    const unavailable = () =>
      new DomainError(
        503,
        'UNAVAILABLE',
        'Chưa xác minh được kết quả từ VNPay. Vui lòng kiểm tra lại cùng yêu cầu.',
      );
    if (settings.tmnCode !== payment.tmnCode) throw unavailable();
    const params = {
      vnp_RequestId: randomUUID().replaceAll('-', ''),
      vnp_Version: '2.1.0',
      vnp_Command: 'querydr',
      vnp_TmnCode: payment.tmnCode,
      vnp_TxnRef: payment.id,
      vnp_TransactionDate: vnDate(payment.createdAt),
      vnp_CreateDate: vnDate(new Date()),
      vnp_IpAddr: '127.0.0.1',
      vnp_OrderInfo: 'Truy van nap vi Lat lai',
    };
    const signature = createHmac('sha512', settings.secret)
      .update(Object.values(params).join('|'))
      .digest('hex');
    try {
      const response = await fetch(QUERY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, vnp_SecureHash: signature }),
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      });
      if (!response.ok) throw unavailable();
      const text = await response.text();
      if (text.length > 16_000) throw unavailable();
      const raw: unknown = JSON.parse(text);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw unavailable();
      const data = raw as Record<string, unknown>;
      if (
        Object.keys(data).length > 32 ||
        Object.values(data).some(
          (value) => typeof value !== 'string' || value.length > 1000,
        )
      )
        throw unavailable();
      const hash = data.vnp_SecureHash;
      const expected = createHmac('sha512', settings.secret)
        .update(
          QUERY_RESPONSE_FIELDS.map((field) => data[field] ?? '').join('|'),
        )
        .digest('hex');
      if (
        typeof hash !== 'string' ||
        !/^[a-fA-F0-9]{128}$/.test(hash) ||
        !timingSafeEqual(
          Buffer.from(expected, 'hex'),
          Buffer.from(hash, 'hex'),
        ) ||
        !/^[A-Za-z0-9-]{1,32}$/.test(String(data.vnp_ResponseId ?? '')) ||
        (data.vnp_Command !== undefined && data.vnp_Command !== 'querydr') ||
        data.vnp_TmnCode !== payment.tmnCode ||
        data.vnp_TxnRef !== payment.id ||
        data.vnp_ResponseCode !== '00' ||
        data.vnp_TransactionType !== '01' ||
        !/^\d{1,12}$/.test(String(data.vnp_Amount ?? '')) ||
        Number(data.vnp_Amount) !== payment.amount * 100 ||
        !/^\d{2}$/.test(String(data.vnp_TransactionStatus ?? ''))
      )
        throw unavailable();
      // A query acknowledgement is not a payment acknowledgement. Only verified
      // paid status is applied; pending/failed results never manufacture credit.
      if (data.vnp_TransactionStatus !== '00') return null;
      if (
        !/^\d{1,32}$/.test(String(data.vnp_TransactionNo ?? '')) ||
        data.vnp_TransactionNo === '0' ||
        !/^\d{14}$/.test(String(data.vnp_PayDate ?? ''))
      )
        throw unavailable();
      parseVNDate(String(data.vnp_PayDate));
      return {
        vnp_TmnCode: payment.tmnCode,
        vnp_TxnRef: payment.id,
        vnp_Amount: String(data.vnp_Amount),
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
        vnp_TransactionNo: String(data.vnp_TransactionNo),
        vnp_PayDate: String(data.vnp_PayDate),
      };
    } catch {
      // Never expose merchant credentials, provider payloads or signed URLs.
      throw unavailable();
    }
  }
}
