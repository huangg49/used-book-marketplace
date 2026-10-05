import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import { queryClient } from '../lib/session';
import { appTheme } from '../styles/theme';

interface Props {
  children: ReactNode;
}

export function Providers({ children }: Props) {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider locale={viVN} theme={appTheme}>
        {children}
      </ConfigProvider>
    </QueryClientProvider>
  );
}
