import { Input } from 'antd';
import { Search } from 'lucide-react';
import type { InputProps } from 'antd';

export function SearchBar(props: InputProps) {
  return (
    <Input
      size="large"
      placeholder="Tìm kiếm sách..."
      prefix={<Search size={18} style={{ color: '#888', marginRight: 8 }} />}
      style={{ borderRadius: 24, paddingLeft: 16 }}
      {...props}
    />
  );
}
