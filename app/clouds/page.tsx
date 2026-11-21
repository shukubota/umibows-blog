import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import CloudsPage from "@/components/clouds/CloudsPage";

export const metadata: Metadata = {
  title: "十種雲形 — 10種類の雲と、そのでき方の数式 | Umibows Blog",
  description:
    "巻雲から積乱雲まで、WMO の十種雲形それぞれのでき方を、断熱冷却・飽和水蒸気圧・不安定などの数式で解説する。",
};

export default function Page() {
  return (
    <main>
      <CloudsPage />
    </main>
  );
}
