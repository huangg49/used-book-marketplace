import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { Providers } from './app/providers';
import { router } from './app/router';
import './styles/global.css';
import { installViewTransitionFallback } from './lib/view-transition-fallback';

installViewTransitionFallback(document);

// Khởi động session từ token đã lưu (memory-only trên browser)
import { session } from './lib/session';
void session.restore();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
