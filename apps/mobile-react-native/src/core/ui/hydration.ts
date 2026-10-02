import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

// Static exports have no viewport. Keep the server and first hydration render
// identical; client navigation and native rendering can use dimensions at once.
export function useHydratedViewport() {
  return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}
