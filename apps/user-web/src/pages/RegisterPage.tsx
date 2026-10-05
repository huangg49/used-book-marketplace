import { Link } from 'react-router-dom';

// TODO: Form đăng ký tài khoản mới.
// API endpoint POST /auth/register chưa được triển khai trong version hiện tại
// (xem docs/handoff/START_HERE.md — "Đăng ký" chưa có). Để placeholder và ghi TODO rõ ràng.
export function RegisterPage() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F5EFDF',
        padding: '2rem',
      }}
    >
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <h1 style={{ fontFamily: 'Lora, serif', color: '#214B40', marginBottom: '1rem' }}>
          Đăng ký
        </h1>
        <p style={{ color: '#963F28' }}>
          Tính năng đăng ký tài khoản đang được phát triển.{' '}
          {/* TODO: Implement khi API POST /auth/register được triển khai */}
        </p>
        <Link to="/login" style={{ color: '#214B40' }}>
          ← Về đăng nhập
        </Link>
      </div>
    </main>
  );
}
