import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <main
      style={{
        minHeight: '60dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem 1rem',
        background: '#F5EFDF',
        textAlign: 'center',
      }}
    >
      <p
        style={{
          fontFamily: 'Lora, serif',
          fontSize: '5rem',
          color: '#963F28',
          lineHeight: 1,
          margin: '0 0 1rem',
        }}
      >
        404
      </p>
      <h1 style={{ color: '#214B40', marginBottom: '0.75rem' }}>
        Không tìm thấy trang
      </h1>
      <p style={{ color: '#6b6254', marginBottom: '2rem' }}>
        Trang bạn đang tìm không tồn tại hoặc đã bị di chuyển.
      </p>
      <Link
        to="/"
        style={{
          color: '#214B40',
          fontWeight: 700,
          textDecoration: 'underline',
        }}
      >
        Về trang chủ
      </Link>
    </main>
  );
}
