import { sampleCsv } from "@/features/dashboard/sample";

// Same generator as "Try with sample data", so the download matches what the demo shows.
// The data is fixed, so Next.js prerenders this once at build time.
export function GET() {
  return new Response(sampleCsv(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="duka-digital-sample.csv"',
    },
  });
}
