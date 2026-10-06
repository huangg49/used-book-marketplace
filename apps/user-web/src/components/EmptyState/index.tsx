import { Empty } from 'antd';
import { BookX } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  title?: ReactNode;
  description?: ReactNode;
}

export function EmptyState({ title = 'Không tìm thấy kết quả', description = 'Hãy thử tìm kiếm với từ khóa khác nhé.' }: EmptyStateProps) {
  return (
    <div style={{ padding: '3rem 1rem', display: 'flex', justifyContent: 'center' }}>
      <Empty
        image={<BookX size={64} style={{ color: '#d9d0bf', margin: '0 auto' }} />}
        description={
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#202C27', marginTop: 16 }}>{title}</div>
            <div style={{ color: '#6b6254', marginTop: 8 }}>{description}</div>
          </div>
        }
      />
    </div>
  );
}
