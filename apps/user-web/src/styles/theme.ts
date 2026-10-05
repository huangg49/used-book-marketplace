import { theme, type ThemeConfig } from 'antd';

export const appTheme: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: '#214B40', // forest green
    colorInfo: '#214B40',
    colorSuccess: '#3e6a4d',
    colorWarning: '#d48a35',
    colorError: '#963F28', // terracotta
    colorTextBase: '#202C27', // ink
    colorBgBase: '#F5EFDF', // paper
    colorBgContainer: '#FFFCF4', // surface
    colorBorder: '#d9d0bf',
    borderRadius: 6,
    fontFamily: '"Be Vietnam Pro", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    controlHeight: 48, // larger, easier to click
  },
  components: {
    Layout: {
      headerBg: '#214B40',
      headerColor: '#F5EFDF',
      footerBg: '#214B40',
    },
    Button: {
      paddingInline: 24,
      fontWeight: 600,
    },
  },
};
