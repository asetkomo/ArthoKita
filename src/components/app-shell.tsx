import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type ReactNode } from "react";
import { BarChart3, Bell, CreditCard, LayoutDashboard, LogOut, Moon, PiggyBank, Receipt, Repeat, Settings, Sun, Target, Wallet } from "lucide-react";
import { logout } from "@/lib/auth.functions";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Transaksi", icon: Receipt },
  { to: "/rekap", label: "Rekap Tahunan", icon: BarChart3 },
  { to: "/accounts", label: "Akun", icon: Wallet },
  { to: "/debts", label: "Hutang & Cicilan", icon: CreditCard },
  { to: "/subscriptions", label: "Langganan", icon: Repeat },
  { to: "/budgets", label: "Budget", icon: PiggyBank },
  { to: "/goals", label: "Target", icon: Target },
  { to: "/reminders", label: "Pengingat", icon: Bell },
  { to: "/settings", label: "Pengaturan", icon: Settings },
] as const;

export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  function toggle() {
    const d = !dark;
    document.documentElement.classList.toggle("dark", d);
    try { localStorage.setItem("dk-theme", d ? "dark" : "light"); } catch { /* ignore */ }
    setDark(d);
  }
  return (
    <button onClick={toggle} aria-label={dark ? "Mode terang" : "Mode gelap"} className={className ?? "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-muted hover:bg-sidebar-accent"}>
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      {className === undefined ? (dark ? "Mode terang" : "Mode gelap") : null}
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const doLogout = useServerFn(logout);
  const navigate = useNavigate();
  const router = useRouter();
  async function out() {
    await doLogout();
    await router.invalidate();
    await navigate({ to: "/login" });
  }
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="no-print sticky top-0 hidden h-screen flex-col bg-sidebar p-4 text-sidebar-foreground lg:flex">
        <div className="mb-8 px-2 pt-2">
          <p className="font-display text-2xl font-bold">Dompetku<span className="text-sidebar-primary">.</span></p>
          <p className="text-xs text-ink-muted">buku kas pribadi</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent" activeProps={{ className: "bg-sidebar-accent text-sidebar-primary font-semibold" }}>
              <n.icon className="size-4" /> {n.label}
            </Link>
          ))}
        </nav>
        <ThemeToggle />
        <button onClick={out} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-muted hover:bg-sidebar-accent">
          <LogOut className="size-4" /> Keluar
        </button>
      </aside>
      <div className="min-w-0">
        <header className="no-print sticky top-0 z-30 bg-sidebar text-sidebar-foreground lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="font-display text-xl font-bold">Dompetku<span className="text-sidebar-primary">.</span></p>
            <div className="flex items-center gap-1">
              <ThemeToggle className="p-2" />
              <button onClick={out} aria-label="Keluar"><LogOut className="size-4" /></button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-3">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs" activeProps={{ className: "bg-sidebar-primary text-sidebar-primary-foreground font-semibold" }}>
                <n.icon className="size-3.5" /> {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="no-print flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
