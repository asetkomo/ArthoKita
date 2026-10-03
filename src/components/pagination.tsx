import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export function Pagination({
  offset,
  pageSize,
  total,
  visible,
  onChange,
}: {
  offset: number;
  pageSize: number;
  total: number;
  visible: number;
  onChange: (offset: number) => void;
}) {
  const { t } = useI18n();
  if (total <= pageSize) return null;
  const page = Math.floor(offset / pageSize) + 1;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav
      className="no-print mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm"
      aria-label={t("Navigasi halaman")}
    >
      <p className="min-w-0 truncate text-muted-foreground">
        {offset + 1}–{offset + visible} {t("dari")} {total}
      </p>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="icon"
          variant="outline"
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - pageSize))}
          aria-label={t("Sebelumnya")}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-14 text-center">
          {page} / {pages}
        </span>
        <Button
          size="icon"
          variant="outline"
          disabled={offset + visible >= total}
          onClick={() => onChange(offset + pageSize)}
          aria-label={t("Berikutnya")}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </nav>
  );
}
