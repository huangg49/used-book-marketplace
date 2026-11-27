import { Spin } from 'antd';
import { Loader2 } from 'lucide-react';

export function LoadingState({ text = 'Đang tải...' }: { text?: string }) {
  return (
    <div style={{ padding: '3rem 1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: 12 }}>
      <Spin indicator={<Loader2 size={32} style={{ color: 'var(--shop-wine, #6B1917)' }} className="ant-spin-dot" />} />
      <div style={{ color: '#6b6254' }}>{text}</div>
    </div>
  );
}
