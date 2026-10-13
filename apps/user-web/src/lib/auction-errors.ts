import { ApiError } from '@used-books/session-client'

/** Message for a failed auction or point-order command. */
export function commandError(error: unknown) {
  if (!(error instanceof ApiError) || error.status === 0)
    return 'Không kết nối được máy chủ nên chưa rõ thao tác đã được ghi hay chưa. Hãy thử lại đúng thao tác này.'
  if (error.status >= 500) return 'Máy chủ đang gặp sự cố nên chưa rõ kết quả. Hãy thử lại đúng thao tác này.'
  if (error.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
  if (error.code === 'IdempotencyConflict') return 'Thao tác trước chưa hoàn tất. Hãy tải lại trang để xem trạng thái mới nhất.'
  // Lỗi nghiệp vụ của API đấu giá đã có lời nhắn tiếng Việt cho người dùng.
  return error.message || 'Không thể thực hiện thao tác này. Hãy tải lại trang.'
}
