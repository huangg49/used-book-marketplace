type PublicApiUrls = {
  shared?: string;
  android?: string;
  web?: string;
  ios?: string;
};

export function apiBaseUrl(platform: string, urls: PublicApiUrls): string {
  const selected =
    (platform === "android"
      ? urls.android
      : platform === "web"
        ? urls.web
        : platform === "ios"
          ? urls.ios
          : undefined) || urls.shared;
  if (!selected)
    throw new Error(
      "Set EXPO_PUBLIC_API_BASE_URL in apps/mobile-react-native/.env. See README.",
    );
  const url = new URL(selected);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.replace(/\/$/, "").endsWith("/api/v1")
  )
    throw new Error(
      "Public API URL must be HTTP(S), end in /api/v1 and contain no credentials or query.",
    );
  return selected.replace(/\/$/, "");
}
