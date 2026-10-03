import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-lg rounded-2xl border bg-card p-8 text-center">
      <h2 className="text-xl font-semibold">Data gagal dimuat</h2>
      <p className="mt-2 text-sm text-muted-foreground break-words">
        {error instanceof Error ? error.message : String(error)}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Pastikan environment Supabase sudah diatur dan schema SQL sudah dijalankan.
      </p>
      <Button
        className="mt-5"
        onClick={() => {
          router.invalidate();
          reset();
        }}
      >
        Coba lagi
      </Button>
    </div>
  );
}
