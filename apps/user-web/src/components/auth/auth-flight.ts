const load = () => import('./wind/login-flight.mjs');
let loaded: ReturnType<typeof load> | undefined;
export function flightModule() {
  if (!loaded) {
    loaded = load();
    void loaded.catch(() => { loaded = undefined; });
  }
  return loaded;
}
export async function warmAuthFlight(source: HTMLElement) {
  try { await (await flightModule()).prepareFlight(source); }
  catch { /* Missing Canvas/capture keeps the existing opaque-paper fallback. */ }
}
