import Link from "next/link";
import { projects, site } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="no-print border-b border-line bg-surface/80 backdrop-blur">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-fg"
      >
        Skip to content
      </a>
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3"
      >
        <Link href="/" className="font-semibold tracking-tight">
          {site.name}
          <span className="text-muted font-normal"> · {site.role}</span>
        </Link>
        <ul className="flex items-center gap-4 text-sm">
          {projects.map((p) => (
            <li key={p.href}>
              <Link href={p.href} className="text-muted hover:text-fg">
                {p.name}
              </Link>
            </li>
          ))}
          <li>
            <a
              href={site.fiverrUrl}
              className="rounded-full bg-accent px-3 py-1.5 font-medium text-accent-fg hover:bg-accent-hover"
            >
              Hire me
            </a>
          </li>
        </ul>
      </nav>
    </header>
  );
}
