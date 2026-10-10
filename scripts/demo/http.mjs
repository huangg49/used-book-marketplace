import { ScenarioError } from "./journal.mjs";

export function createHttp(
  base,
  tokens,
  { fetcher = fetch, timeout = 15_000 } = {},
) {
  const prefix = new URL(base);
  if (
    prefix.hostname !== "127.0.0.1" ||
    prefix.protocol !== "http:" ||
    prefix.pathname !== "/api/v1"
  )
    throw new ScenarioError(
      "INVALID_TARGET",
      "Only the managed loopback API is supported.",
    );
  return async (
    route,
    { actor, method = "GET", body, headers = {}, binary = false } = {},
  ) => {
    if (
      !/^\/(?!\/)[a-zA-Z0-9/_-]+(?:\?(?:[a-zA-Z0-9?=&_.-]|%[0-9a-fA-F]{2})+)?$/.test(
        route,
      )
    )
      throw new ScenarioError("INVALID_ROUTE", "Invalid scenario API route.");
    let response;
    try {
      response = await fetcher(base + route, {
        method,
        headers: {
          ...headers,
          ...(binary ? {} : { "Content-Type": "application/json" }),
          ...(actor ? { Authorization: `Bearer ${tokens[actor]}` } : {}),
        },
        body:
          body === undefined ? undefined : binary ? body : JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(timeout),
      });
      if (!response.ok)
        throw new ScenarioError(
          response.status >= 500 || response.status === 408
            ? "HTTP_UNCERTAIN"
            : "HTTP_REJECTED",
          `Scenario API returned HTTP ${response.status}.`,
          response.status,
        );
      if (response.status === 204) return undefined;
      return await response.json();
    } catch (error) {
      if (error instanceof ScenarioError) throw error;
      throw new ScenarioError(
        "HTTP_UNCERTAIN",
        "Scenario API response was lost or unreadable.",
      );
    }
  };
}
