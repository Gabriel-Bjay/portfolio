import type { Metadata } from "next";
import { DashboardApp } from "@/features/dashboard/DashboardApp";

export const metadata: Metadata = {
  title: "Mauzo Insights",
  description:
    "Drop in a CSV or Excel sales export and get an interactive dashboard, a forecast and plain-English insights. Everything runs in your browser.",
};

export default function DashboardPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:py-14">
      <DashboardApp />
    </main>
  );
}
