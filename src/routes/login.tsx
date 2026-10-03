import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSession, login } from "@/lib/auth.functions";
import { errMsg } from "@/lib/queries";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Masuk — Dompetku" },
      { name: "description", content: "Masuk ke buku kas pribadi Dompetku." },
      { property: "og:title", content: "Masuk — Dompetku" },
      { property: "og:description", content: "Masuk ke buku kas pribadi Dompetku." },
    ],
  }),
  beforeLoad: async () => {
    const s = await getSession();
    if (s.authenticated) throw redirect({ to: "/dashboard" });
  },
  component: LoginPage,
});

function LoginPage() {
  const doLogin = useServerFn(login);
  const navigate = useNavigate();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await doLogin({ data: { username, password } });
      if (!r.ok) setError("Username atau password salah.");
      else {
        await router.invalidate();
        await navigate({ to: "/dashboard" });
      }
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-ink p-12 text-ink-foreground lg:flex ledger-bg">
        <p className="font-display text-3xl font-bold">Dompetku<span className="text-accent">.</span></p>
        <div>
          <p className="font-display text-5xl font-bold leading-tight">Setiap rupiah<br />punya cerita.</p>
          <p className="mt-4 max-w-sm text-ink-muted">Pemasukan, pengeluaran, cicilan paylater, dan langganan — tercatat rapi, diingatkan tepat waktu.</p>
        </div>
        <p className="text-xs text-ink-muted">Akses pribadi</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div className="mb-8">
            <div className="mb-4 inline-flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Lock className="size-5" /></div>
            <h1 className="text-3xl font-bold">Masuk</h1>
            <p className="text-sm text-muted-foreground">Gunakan akun yang terdaftar di server.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u">Username</Label>
            <Input id="u" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p">Password</Label>
            <Input id="p" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" size="lg" disabled={busy}>{busy ? "Memeriksa…" : "Masuk"}</Button>
        </form>
      </div>
    </div>
  );
}
