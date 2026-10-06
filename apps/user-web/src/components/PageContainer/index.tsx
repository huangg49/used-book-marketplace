import type { ReactNode } from 'react';

interface PageContainerProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function PageContainer({ children, className, style }: PageContainerProps) {
  return (
    <div
      className={className}
      style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '0 clamp(1rem, 4vw, 2rem)',
        width: '100%',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
