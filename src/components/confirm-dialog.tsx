import { useCallback, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Pending = { title: string; description?: string; confirmLabel: string; destructive: boolean; resolve: (ok: boolean) => void };

/** Promise-based confirm dialog matching the app design (replaces window.confirm). */
export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback(
    (title: string, opts?: { description?: string; confirmLabel?: string; destructive?: boolean }) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setPending({
          title,
          description: opts?.description,
          confirmLabel: opts?.confirmLabel ?? "Ya, lanjutkan",
          destructive: opts?.destructive ?? false,
          resolve,
        });
      }),
    [],
  );

  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setPending(null);
  };

  const element = (
    <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o) settle(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
          {pending?.description ? <AlertDialogDescription>{pending.description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction
            className={pending?.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            onClick={() => settle(true)}
          >
            {pending?.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, element };
}
