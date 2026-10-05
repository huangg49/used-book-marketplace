import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { session } from '../lib/session';

// Dùng lại session.login() từ @used-books/session-client — KHÔNG tự viết lại.
export function LoginPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError(undefined);
    try {
      await session.login({
        email: String(data.get('email')).trim(),
        password: String(data.get('password')),
      });
      void navigate('/', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

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
        <h1 style={{ fontFamily: 'Lora, serif', color: '#214B40', marginBottom: '2rem' }}>
          Đăng nhập
        </h1>

        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'grid', gap: '1rem' }}>
          <label style={{ display: 'grid', gap: '0.4rem', fontWeight: 700 }}>
            Email
            <input name="email" type="email" autoComplete="username" required disabled={busy} />
          </label>

          <label style={{ display: 'grid', gap: '0.4rem', fontWeight: 700 }}>
            Mật khẩu
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={busy}
            />
          </label>

          {error !== undefined && (
            <p role="alert" style={{ color: '#963F28', margin: 0 }}>
              {error instanceof Error ? error.message : 'Đăng nhập thất bại. Vui lòng thử lại.'}
            </p>
          )}

          <button type="submit" disabled={busy}>
            {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>

        <p style={{ marginTop: '1.5rem', fontSize: '0.9rem' }}>
          Chưa có tài khoản?{' '}
          <Link to="/register" style={{ color: '#214B40' }}>
            Đăng ký
          </Link>
        </p>
      </div>
    </main>
  );
}
