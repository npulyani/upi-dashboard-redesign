import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    // BASE_URL is set by Vite to the `base` config value (e.g. "/upi-dashboard-redesign/" or "/").
    // Strip trailing slash so TanStack Router normalises paths correctly.
    basepath: (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "") || "/",
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });

  return router;
};
