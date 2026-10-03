import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/auth.functions";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const s = await getSession();
    if (!s.authenticated) throw redirect({ to: "/login" });
    return { user: s.user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
