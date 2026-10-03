import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { clearSessionCache, isUnauthorizedError } from "./lib/session-cache";

export const getRouter = () => {
  // The client caches the session check (see _app.tsx); when a server fn
  // rejects with "Unauthorized" (expired/cleared cookie) drop that cache and
  // send the user back to /login.
  let redirecting = false;
  const onAuthError = (err: unknown) => {
    if (typeof window === "undefined" || !isUnauthorizedError(err)) return;
    clearSessionCache();
    if (redirecting || router.state.location.pathname === "/login") return;
    redirecting = true;
    void router.navigate({ to: "/login" }).finally(() => {
      redirecting = false;
    });
  };

  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: onAuthError }),
    mutationCache: new MutationCache({ onError: onAuthError }),
    defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false } },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Loaders use ensureQueryData, so React Query owns freshness; this only
    // stops hover-preloaded routes from re-running their loaders right away.
    defaultPreloadStaleTime: 30_000,
    defaultPreload: "intent",
  });

  return router;
};
