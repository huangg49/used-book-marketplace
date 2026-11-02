import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { components } from '@used-books/api-contract';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import styles from './DemoReviewAdvance.module.css';

type DemoState = components['schemas']['DemoReviewTimeAdvance'];
type Command = components['schemas']['AdvanceDemoReviewTime'];

export function DemoReviewAdvance({ state, version, partnerId, disabled, busy, send }: {
  state?: DemoState; version?: number; partnerId: string; disabled: boolean; busy: boolean;
  send: (body: Command) => Promise<boolean>;
}) {
  const [confirmation, setConfirmation] = useState<Command | null>(null);
  if (!state) return null;
  return <aside className={styles.demo} aria-label="Mô phỏng đánh giá local">
    <h3>{state.applied ? 'Đã mô phỏng hết thời gian chờ' : 'Demo ngay, không cần chờ 48 giờ'}</h3>
    <p>{state.applied
      ? 'Hai đánh giá đã được công bố. Bạn có thể xem nhận xét của đối tác và điểm uy tín sau giao dịch.'
      : 'Chỉ dành cho giao dịch mẫu local. Sau khi cả hai bên gửi, có thể mô phỏng hết hạn sửa để xem kết quả công khai.'}</p>
    {state.applied ? <Link to={`/members/${partnerId}`}>Xem hồ sơ uy tín đối tác</Link>
      : <button type="button" disabled={disabled || busy || !state.available || !version || !state.pairToken}
        onClick={() => setConfirmation({ expectedVersion: version!, pairToken: state.pairToken! })}>
        Bỏ chờ 48 giờ (demo)
      </button>}
    {!state.applied && !state.available && <p>Cần đủ hai đánh giá đang trong hạn sửa và không bị giữ làm bằng chứng.</p>}
    <ConfirmDialog isOpen={confirmation !== null} onClose={() => setConfirmation(null)}
      title="Công bố hai đánh giá mẫu ngay?"
      description="Hai bên sẽ xem được đánh giá của nhau và điểm uy tín sẽ được cập nhật. Sau bước này không còn quyền sửa hoặc xóa hai đánh giá."
      confirmText="Mô phỏng và công bố" cancelText="Chưa công bố" isBusy={busy}
      onConfirm={() => { if (confirmation) void send(confirmation).finally(() => setConfirmation(null)); }}>
      <p>Chỉ mốc thời gian của giao dịch mẫu và hai đánh giá được lùi lại, có lưu lịch sử mô phỏng. Nội dung, điểm đánh giá và tiền trong ví được giữ nguyên.</p>
    </ConfirmDialog>
  </aside>;
}
