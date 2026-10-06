import { describe, expect, it } from 'vitest';
import { formatCurrency } from './utils';

describe('formatCurrency', () => {
  it('định dạng đúng số tiền VNĐ', () => {
    // Replace non-breaking spaces for testing reliably
    const result = formatCurrency(150000).replace(/\u00A0/g, ' ');
    // Ở Node.js tùy phiên bản có thể ra "150.000 ₫" hoặc "150.000 ₫" 
    expect(result).toMatch(/150\.000.*₫/);
  });

  it('xử lý số 0', () => {
    const result = formatCurrency(0).replace(/\u00A0/g, ' ');
    expect(result).toMatch(/0.*₫/);
  });
});
