import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dompetku — Pelacak Keuangan Pribadi" },
      {
        name: "description",
        content: "Catat pemasukan, pengeluaran, cicilan, dan langganan dalam satu tempat.",
      },
      { property: "og:title", content: "Dompetku — Pelacak Keuangan Pribadi" },
      {
        property: "og:description",
        content: "Catat pemasukan, pengeluaran, cicilan, dan langganan dalam satu tempat.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
