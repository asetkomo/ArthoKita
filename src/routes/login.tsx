import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { login } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/login")({
  head: () => pageHead("Masuk", "Masuk ke Dompetku — pelacak keuangan pribadi."),
  beforeLoad: async () => {
    const { getSession } = await import("@/lib/auth.functions");
    const { clearSessionCache } = await import("@/lib/session-cache");
    // Reaching /login (logout, expired session) always drops the cached check.
    clearSessionCache();
    const s = await getSession();
    if (s.authenticated) throw redirect({ to: "/dashboard" });
  },
  component: LoginPage,
});

function LoginPage() {
  const { t } = useI18n();
  const run = useServerFn(login);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await run({
        data: {
          username: String(fd.get("username") ?? ""),
          password: String(fd.get("password") ?? ""),
        },
      });
      window.location.href = "/dashboard";
    } catch {
      toast.error(t("Username atau password salah"));
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-sidebar px-4">
      <Card className="w-full max-w-sm p-8">
        <p className="font-display text-3xl font-bold">
          Dompetku<span className="text-sidebar-primary">.</span>
        </p>
        <p className="mt-1 text-sm text-ink-muted">{t("buku kas pribadi")}</p>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="username">{t("Username")}</Label>
            <Input id="username" name="username" autoComplete="username" required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{t("Password")}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? t("Memeriksa…") : t("Masuk")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
