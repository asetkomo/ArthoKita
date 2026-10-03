import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type ReactNode } from "react";
import { BarChart3, Bell, Coins, CreditCard, HandCoins, LayoutDashboard, Languages, LogOut, Moon, PiggyBank, Receipt, Repeat, Settings, Sun, Target, Wallet } from "lucide-react";
import { logout } from "@/lib/auth.functions";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Transaksi", icon: Receipt },
  { to: "/reports", label: "Laporan", icon: BarChart3 },
  { to: "/rekap", label: "Rekap Tahunan", icon: BarChart3 },
  { to: "/accounts", label: "Akun", icon: Wallet },
  { to: "/debts", label: "Hutang & Cicilan", icon: CreditCard },
  { to: "/subscriptions", label: "Langganan", icon: Repeat },
  { to: "/budgets", label: "Budget", icon: PiggyBank },
  { to: "/goals", label: "Target", icon: Target },
  { to: "/gold", label: "Emas", icon: Coins },
  { to: "/receivables", label: "Piutang", icon: HandCoins },
  { to: "/reminders", label: "Pengingat", icon: Bell },
  { to: "/settings", label: "Pengaturan", icon: Settings },
] as const;

export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useI18n();
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
    <Button type="button" variant="ghost" onClick={toggle} aria-label={dark ? t("Mode terang") : t("Mode gelap")} className={className ?? "flex w-full justify-start gap-3 px-3 py-2 text-sm text-ink-muted hover:bg-sidebar-accent"}>
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      {className === undefined ? (dark ? t("Mode terang") : t("Mode gelap")) : null}
    </Button>
  );
}

export function LanguageToggle({ className }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => setLang(lang === "id" ? "en" : "id")}
      aria-label={t("Ganti bahasa")}
      className={className ?? "flex w-full justify-start gap-3 px-3 py-2 text-sm text-ink-muted hover:bg-sidebar-accent"}
    >
      <Languages className="size-4" />
      {className === undefined ? (lang === "id" ? "EN" : "ID") : <span className="text-xs font-semibold">{lang.toUpperCase()}</span>}
    </Button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const doLogout = useServerFn(logout);
  const navigate = useNavigate();
  const router = useRouter();
  async function out() {
    await doLogout();
    await router.invalidate();
    await navigate({ to: "/login" });
  }
  const sideItem = "flex items-center justify-center gap-3 rounded-lg p-2.5 text-sm transition-colors hover:bg-sidebar-accent lg:justify-start lg:px-3 lg:py-2";
  const sideTool = "flex w-full justify-center gap-3 px-3 py-2 text-sm text-ink-muted hover:bg-sidebar-accent lg:justify-start";
  return (
    <TooltipProvider delayDuration={200}>
    <div className="min-h-screen w-full max-w-full overflow-x-clip md:grid md:grid-cols-[72px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="no-print fixed inset-y-0 left-0 z-40 hidden w-[72px] flex-col overflow-y-auto bg-sidebar px-2 py-4 text-sidebar-foreground md:flex lg:w-[240px] lg:p-4">
        <div className="mb-6 px-1 pt-2 text-center lg:mb-8 lg:px-2 lg:text-left">
          <p className="font-display text-2xl font-bold"><span className="lg:hidden">D</span><span className="hidden lg:inline">Dompetku</span><span className="text-sidebar-primary">.</span></p>
          <p className="hidden text-xs text-ink-muted lg:block">{t("buku kas pribadi")}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((n) => (
            <Tooltip key={n.to}>
              <TooltipTrigger asChild>
                <Link to={n.to} aria-label={t(n.label)} className={sideItem} activeProps={{ className: "bg-sidebar-accent text-sidebar-primary font-semibold" }}>
                  <n.icon className="size-5 shrink-0 lg:size-4" /> <span className="hidden truncate lg:inline">{t(n.label)}</span>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" className="lg:hidden">{t(n.label)}</TooltipContent>
            </Tooltip>
          ))}
        </nav>
        <div className="mt-4 flex flex-col gap-0.5">
          <div className="hidden lg:contents">
            <ThemeToggle />
            <LanguageToggle />
          </div>
          <div className="flex flex-col items-center gap-0.5 lg:hidden">
            <ThemeToggle className="size-11 p-0 text-ink-muted hover:bg-sidebar-accent" />
            <LanguageToggle className="h-11 w-full gap-1 px-1 text-ink-muted hover:bg-sidebar-accent" />
          </div>
          <Button type="button" variant="ghost" onClick={out} aria-label={t("Keluar")} className={sideTool}>
            <LogOut className="size-4" /> <span className="hidden lg:inline">{t("Keluar")}</span>
          </Button>
        </div>
      </aside>
      <div className="min-w-0 md:col-start-2">
        <header className="no-print sticky top-0 z-30 bg-sidebar pt-[env(safe-area-inset-top)] text-sidebar-foreground short:static md:hidden">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-3 short:py-1.5">
            <p className="min-w-0 truncate font-display text-xl font-bold">Dompetku<span className="text-sidebar-primary">.</span></p>
            <div className="flex shrink-0 items-center gap-1 whitespace-nowrap">
              <LanguageToggle className="h-9 shrink-0 gap-1.5 px-2" />
              <ThemeToggle className="size-9 shrink-0 p-0" />
              <Button type="button" size="icon" variant="ghost" className="size-9 shrink-0" onClick={out} aria-label={t("Keluar")}><LogOut className="size-4" /></Button>
            </div>
          </div>
          <nav className="no-scrollbar flex max-w-full gap-1 overflow-x-auto px-3 pb-3 short:pb-2" aria-label={t("Menu utama")}>
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs" activeProps={{ className: "bg-sidebar-primary text-sidebar-primary-foreground font-semibold" }}>
                <n.icon className="size-3.5" /> {t(n.label)}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full min-w-0 max-w-6xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
    </TooltipProvider>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 max-sm:grid-cols-1">
      <div className="min-w-0">
        <h1 className="break-words text-3xl font-bold sm:text-4xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="no-print flex min-w-0 max-w-full flex-wrap gap-2 sm:justify-end">{actions}</div> : null}
    </div>
  );
}
