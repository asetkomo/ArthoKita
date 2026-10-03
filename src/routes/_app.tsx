import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/auth.functions";
import { clearSessionCache, getCachedSession, setCachedSession } from "@/lib/session-cache";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const hit = getCachedSession();
    if (hit) return { user: hit.user };
    const s = await getSession();
    if (!s.authenticated) {
      clearSessionCache();
      throw redirect({ to: "/login" });
    }
    setCachedSession(s.user);
    return { user: s.user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
