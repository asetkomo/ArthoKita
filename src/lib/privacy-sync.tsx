import { useEffect } from "react";
import { markPrivacyLive, readStoredPrivacy, setPrivate, togglePrivate } from "./privacy";

/**
 * Mounted once at the root: after hydration loads the stored privacy preference
 * into the store (re-rendering every amount in place, no remount), lifts the
 * pre-hydration blur and wires the Shift+H shortcut.
 */
export function PrivacySync() {
  useEffect(() => {
    setPrivate(readStoredPrivacy(), false);
    markPrivacyLive();
    function onKey(e: KeyboardEvent) {
      if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== "h") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      togglePrivate();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
