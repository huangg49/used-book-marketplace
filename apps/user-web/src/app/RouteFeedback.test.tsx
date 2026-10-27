import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RouteError, RoutePending } from './RouteFeedback';

type Router = ReturnType<typeof createMemoryRouter>;
const routers: Router[] = [];
afterEach(() => routers.splice(0).forEach(router => router.dispose()));

function createRoute(load: () => Promise<{ Component: () => ReturnType<typeof createElement> }>) {
  const router = createMemoryRouter([
    {
      path: '/',
      HydrateFallback: RoutePending,
      ErrorBoundary: RouteError,
      children: [{ path: 'books', lazy: load }],
    },
  ], { initialEntries: ['/books?mode=Sale#catalog-results'] });
  routers.push(router);
  return router;
}

const render = (router: Router) => renderToStaticMarkup(createElement(RouterProvider, { router }));

describe('route loading recovery', () => {
  it('shows a readable loading state on a cold direct link, then renders its page', async () => {
    let resolve!: (module: { Component: () => ReturnType<typeof createElement> }) => void;
    const pending = new Promise<{ Component: () => ReturnType<typeof createElement> }>(done => { resolve = done; });
    const router = createRoute(() => pending);

    expect(render(router)).toContain('Đang mở trang…');
    expect(render(router)).toContain('role="status"');

    resolve({ Component: () => createElement('h1', null, 'Kệ sách đã tải') });
    await vi.waitFor(() => expect(router.state.initialized).toBe(true));
    const page = render(router);
    expect(page).toContain('Kệ sách đã tải');
    expect(page).not.toContain('Đang mở trang…');
  });

  it('offers a full reload of the requested URL when its code cannot be loaded', async () => {
    const router = createRoute(() => Promise.reject(new Error('private chunk URL and stack')));
    await vi.waitFor(() => expect(router.state.initialized).toBe(true));

    const page = render(router);
    expect(page).toContain('Chưa mở được trang');
    expect(page).toContain('<button');
    expect(page).toContain('Tải lại trang');
    expect(page).toContain('href="/"');
    expect(page).not.toContain('private chunk URL and stack');
    expect(router.state.location).toMatchObject({
      pathname: '/books', search: '?mode=Sale', hash: '#catalog-results',
    });
  });
});
