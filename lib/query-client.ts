import { MutationCache, QueryCache, QueryClient, focusManager } from "@tanstack/react-query";
import { AppState, type AppStateStatus } from "react-native";

// react-query's refetchOnWindowFocus only fires on browser focus events out
// of the box - on native, "focus" means the app coming back to the
// foreground, which we have to wire up ourselves via AppState. Without this,
// a pool doc edited elsewhere (e.g. pricing/capacity changed in the facility
// console) never reaches a member's already-open app until they force-quit.
AppState.addEventListener("change", (status: AppStateStatus) => {
  focusManager.setFocused(status === "active");
});

// Centralized error logging so every screen doesn't need its own try/catch
// around read/write calls - components still opt in to showing `error` /
// `isError` from the query/mutation result for user-facing messaging.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      console.error(`Query failed [${JSON.stringify(query.queryKey)}]`, error);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      console.error(`Mutation failed [${mutation.options.mutationKey ?? "unknown"}]`, error);
    },
  }),
});

export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  return error instanceof Error ? error.message : fallback;
}
