import axios from 'axios';
import { session } from '../lib/session';

// Axios dùng API base cấu hình; /api/v1 đi qua proxy Vite trên cùng origin.
// session.request() đã xử lý token rotation — axios instance này chỉ cho
// các endpoint công khai không cần auth hoặc khi muốn dùng API style quen thuộc.
// TODO: thêm interceptor refresh token nếu cần gọi API riêng ngoài session.request().
const apiBaseUrl = (
  import.meta.env['VITE_API_BASE_URL'] ?? 'http://localhost:3000/api/v1'
).replace(/\/$/, '');

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// Re-export session để các feature có thể import từ services/
export { session };
