export type AuthFlight = { count: number; start: () => void; dispose: () => void };
export function prepareFlight(source: HTMLElement): Promise<void>;
export function createAuthFlight(canvas: HTMLCanvasElement, source: HTMLElement): Promise<AuthFlight>;
