import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { Providers } from './app/providers';
import { router } from './app/router';
import './styles/global.css';
import '../../../packages/brand/v1.1/focus.css';
import { installViewTransitionFallback } from './lib/view-transition-fallback';

installViewTransitionFallback(document);

// Khởi động session từ token đã lưu (memory-only trên browser)
import { session } from './lib/session';
void session.restore();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <MotionConfig reducedMotion="never">
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </MotionConfig>
  </StrictMode>,
);
