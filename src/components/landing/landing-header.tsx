import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Github, Languages, Menu, Moon, Sun } from "lucide-react";
import { AppLogo, AppName } from "@/components/app-logo";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const LANDING_NAV = [
  { href: "#fitur", label: "Fitur" },
  { href: "#cara-kerja", label: "Cara kerja" },
  { href: "#self-host", label: "Self-host" },
] as const;

/** Small, dependency-free theme switch (same `dk-theme` contract as the app shell). */
function ThemeButton() {
  const { t } = useI18n();
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  function toggle() {
    const d = !dark;
    document.documentElement.classList.toggle("dark", d);
    try {
      localStorage.setItem("dk-theme", d ? "dark" : "light");
    } catch {
      /* ignore */
    }
    setDark(d);
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={dark ? t("Mode terang") : t("Mode gelap")}
      className="hover:bg-muted hover:text-foreground"
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}

function LangButton() {
  const { lang, setLang, t } = useI18n();
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => setLang(lang === "id" ? "en" : "id")}
      aria-label={t("Ganti bahasa")}
      className="h-9 gap-1.5 px-2.5 hover:bg-muted hover:text-foreground"
    >
      <Languages />
      <span className="text-xs font-semibold">{lang.toUpperCase()}</span>
    </Button>
  );
}

export function AuthButton({
  authenticated,
  className,
  size = "sm",
}: {
  authenticated: boolean;
  className?: string;
  size?: "sm" | "default" | "lg";
}) {
  const { t } = useI18n();
  return (
    <Button asChild size={size} className={className}>
      {authenticated ? (
        <Link to="/dashboard">{t("Buka Dashboard")}</Link>
      ) : (
        <Link to="/login">{t("Masuk")}</Link>
      )}
    </Button>
  );
}

export function LandingHeader({ authenticated, repo }: { authenticated: boolean; repo: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const link =
    "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-colors",
        scrolled
          ? "border-border bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70"
          : "border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="flex min-w-0 items-center gap-2.5 rounded-md font-display text-xl font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <AppLogo className="size-8" />
          <AppName className="min-w-0 truncate [&>span]:text-accent-foreground dark:[&>span]:text-accent" />
        </Link>
        <nav aria-label={t("Navigasi halaman")} className="ml-6 hidden items-center lg:flex">
          {LANDING_NAV.map((n) => (
            <a key={n.href} href={n.href} className={link}>
              {t(n.label)}
            </a>
          ))}
          <a href={repo} target="_blank" rel="noreferrer" className={link}>
            GitHub
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          <div className="hidden items-center sm:flex">
            <LangButton />
            <ThemeButton />
          </div>
          <AuthButton authenticated={authenticated} className="ml-1 rounded-full px-4" />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden hover:bg-muted hover:text-foreground"
                aria-label={t("Buka menu")}
              >
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 max-w-[85vw]">
              <SheetTitle className="font-display">{t("Menu")}</SheetTitle>
              <SheetDescription className="sr-only">{t("Navigasi halaman")}</SheetDescription>
              <nav aria-label={t("Navigasi halaman")} className="mt-6 flex flex-col gap-1">
                {LANDING_NAV.map((n) => (
                  <a
                    key={n.href}
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className={cn(link, "text-base")}
                  >
                    {t(n.label)}
                  </a>
                ))}
                <a
                  href={repo}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(link, "flex items-center gap-2 text-base")}
                >
                  <Github className="size-4" /> GitHub
                </a>
              </nav>
              <div className="mt-6 flex items-center gap-1 border-t pt-4">
                <LangButton />
                <ThemeButton />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
