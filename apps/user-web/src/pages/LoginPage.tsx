import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { session } from '../lib/session';
import { AuthLayout } from '../layouts/AuthLayout';
import { AuthShowcase } from '../components/AuthShowcase';

export function LoginPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [showPassword, setShowPassword] = useState(false);

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
    <AuthLayout>
      <div className="relative w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.55),0_0_0_1px_rgba(217,175,108,0.25)] ring-1 ring-amber-500/20 overflow-hidden bg-[#ffffff] backdrop-blur-xl auth-card-enter">
        <AuthShowcase className="auth-showcase-enter" />

        {/* RIGHT COLUMN: PRISTINE CONTROLS & AUTH FORM */}
        <div className="lg:col-span-7 bg-[#f8f3e9]/95 backdrop-blur-sm p-8 sm:p-10 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-1.5">
                <div className="w-7 h-7 rounded bg-[#994530] flex items-center justify-center text-[#ffffff] shadow-sm">
                  <span className="material-symbols-outlined text-[16px]">local_library</span>
                </div>
                <span className="font-label-md text-[12px] text-[#994530] uppercase tracking-widest font-semibold">Hiệu Sách Xưa • Thẻ Độc Giả</span>
              </div>
              <span className="font-label-sm text-[11px] text-[#414844] bg-[#f2ede3] px-1 py-0.5 rounded border border-[#c1c8c3]/40">
                Kỳ ghi danh 2024
              </span>
            </div>
            
            <div className="flex flex-col gap-1.5 mb-6 auth-field-1">
              <h1 className="font-headline-xl text-[36px] text-[#1d1c16] tracking-tight font-semibold">
                Chào mừng bạn quay lại kệ sách.
              </h1>
              <p className="font-body-md text-[14px] text-[#414844]">
                Nơi kết nối những tâm hồn trân quý sách cũ, lưu giữ trang văn vượt thời gian.
              </p>
            </div>

            {/* Error Banner */}
            {error !== undefined && (
              <div className="mb-6 rounded-lg p-2 bg-[#ffdad6] text-[#93000a] shadow-sm border border-[#ba1a1a]/20 flex items-start gap-2 transition-all duration-300">
                <span className="material-symbols-outlined text-[18px] text-[#ba1a1a] mt-0.5 shrink-0">error_outline</span>
                <div className="flex-1 flex flex-col">
                  <span className="font-title-md text-[16px] leading-tight text-[#93000a] font-semibold">Lỗi nhận diện thủ thư</span>
                  <span className="font-body-sm text-[13px] text-[#93000a]/90 mt-0.5">
                    {error instanceof Error ? error.message : 'Mật khẩu hoặc email chưa trùng khớp với hồ sơ lưu khố của bạn.'}
                  </span>
                </div>
                <button type="button" onClick={() => setError(undefined)} className="text-[#93000a] hover:opacity-75 transition-opacity" title="Đóng thông báo">
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5 auth-field-2">
                <label htmlFor="email" className="font-label-md text-[12px] text-[#1d1c16] flex items-center justify-between font-semibold">
                  <span>Địa chỉ thư điện tử (Thư khố viên)</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                    disabled={busy}
                    placeholder="nguyen.an@thuvien.vn"
                    className="w-full bg-[#ffffff] text-[#1d1c16] px-3 py-2.5 rounded-md font-body-md text-[14px] shadow-sm border border-[#c1c8c3]/60 focus:border-[#00261a] focus:ring-1 focus:ring-[#00261a] placeholder:text-[#717974] transition-all"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5 auth-field-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="font-label-md text-[12px] text-[#1d1c16] font-semibold">Mật mã thủ thư</label>
                  <a href="#" className="font-label-sm text-[11px] text-[#994530] hover:text-[#762b18] underline underline-offset-4 decoration-[#994530]/40 transition-colors">
                    Quên mật mã tủ thư?
                  </a>
                </div>
                <div className="relative flex items-center">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    disabled={busy}
                    placeholder="••••••••••"
                    className="w-full bg-[#ffffff] text-[#1d1c16] px-3 pr-10 py-2.5 rounded-md font-body-md text-[14px] shadow-sm border border-[#c1c8c3]/60 focus:border-[#00261a] focus:ring-1 focus:ring-[#00261a] placeholder:text-[#717974] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 text-[#717974] hover:text-[#1d1c16] transition-colors flex items-center bg-transparent border-0 !p-0 !min-h-0 w-auto"
                    title="Hiện hoặc ẩn mật khẩu"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between mt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" className="custom-checkbox focus:ring-[#00261a] !min-h-0 w-4 h-4 p-0 !border-0" defaultChecked />
                  <span className="font-label-md text-[12px] text-[#414844] font-semibold">Duy trì phiên đọc trên thiết bị này</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full mt-1 py-3 px-4 rounded-md bg-[#994530] text-[#ffffff] font-title-md text-[16px] tracking-wide shadow-md hover:bg-[#762b18] active:scale-[0.99] transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 !border-0 auth-field-4"
              >
                <span>{busy ? 'Đang mở khóa...' : 'Vào Tủ Sách Của Tôi'}</span>
                {!busy && <span className="material-symbols-outlined text-[18px]">arrow_forward</span>}
              </button>
            </form>

            <div className="relative my-6 flex items-center justify-center">
              <div className="w-full h-px bg-[#e7e2d8]"></div>
              <span className="absolute bg-[#f8f3e9] px-2 font-label-sm text-[11px] text-[#414844] uppercase tracking-wider">
                Hoặc tiếp tục lưu kho với
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 auth-field-5">
              <button type="button" className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-md bg-[#ffffff] text-[#1d1c16] font-label-md text-[12px] font-semibold shadow-sm border border-[#c1c8c3]/50 hover:bg-[#f2ede3] transition-colors !min-h-0">
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.4 8.9 5 12 5z" fill="#EA4335"></path>
                  <path d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5.1 3.7-8.8z" fill="#4285F4"></path>
                  <path d="M5.3 14.7c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.6 7.2C.6 9.2 0 11.5 0 14s.6 4.8 1.6 6.8l3.7-3.1z" fill="#FBBC05"></path>
                  <path d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.4-6.7-5.3L1.6 16c1.9 3.8 5.8 7 10.4 7z" fill="#34A853"></path>
                </svg>
                <span>Thư viện Google</span>
              </button>
              <button type="button" className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-md bg-[#ffffff] text-[#1d1c16] font-label-md text-[12px] font-semibold shadow-sm border border-[#c1c8c3]/50 hover:bg-[#f2ede3] transition-colors !min-h-0">
                <span className="material-symbols-outlined text-[18px] text-[#416656] shrink-0">badge</span>
                <span>Thẻ Thư Viện / VNeID</span>
              </button>
            </div>
          </div>

          <div className="mt-6 pt-4 flex flex-col items-center justify-center text-center gap-1.5">
            <p className="font-body-sm text-[13px] text-[#414844]">
              Chưa sở hữu thẻ thủ thư? 
              <Link to="/register" className="font-semibold text-[#00261a] hover:text-[#173c2e] underline underline-offset-4 decoration-[#00261a]/40 transition-colors ml-1">
                Đăng ký tài khoản mới →
              </Link>
            </p>
            <div className="flex items-center gap-1.5 text-[#414844] font-label-sm text-[11px] opacity-80 mt-1">
              <span className="material-symbols-outlined text-[14px]">shield</span>
              <span>Cam kết tuyệt đối bảo mật thông tin & bảo vệ di sản văn hóa đọc Việt Nam.</span>
            </div>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}
