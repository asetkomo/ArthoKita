import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("dk-theme", next ? "dark" : "light"); } catch { /* ignore */ }
    setDark(next);
  };
  return { dark, toggle };
}

export function ThemeToggle({ className, withLabel }: { className?: string; withLabel?: boolean }) {
  const { dark, toggle } = useTheme();
  const Icon = dark ? Sun : Moon;
  return (
    <button type="button" onClick={toggle} className={className} aria-label={dark ? "Mode terang" : "Mode gelap"}>
      <Icon className="size-4" /> {withLabel ? (dark ? "Mode terang" : "Mode gelap") : null}
    </button>
  );
}
