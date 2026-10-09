import Link from "next/link";
import { projects, site } from "@/lib/site";

export default function Home() {
  return (
    <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-16 sm:py-24">
      <p className="text-sm font-medium text-accent">{site.location}</p>
      <h1 className="mt-2 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
        I build web apps that turn messy data and busy inboxes into something useful.
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-muted">
        {site.name}, {site.role.toLowerCase()}. Below are working demos you can try right
        now. Every one is open source.
      </p>

      <h2 className="sr-only">Projects</h2>
      <ul className="mt-12 grid gap-6 md:grid-cols-2">
        {projects.map((p) => (
          <li key={p.href}>
            <Link
              href={p.href}
              className="group flex h-full flex-col rounded-2xl border border-line bg-surface p-6 transition hover:-translate-y-0.5 hover:border-accent hover:shadow-lg"
            >
              <span className="text-xl font-semibold">{p.name}</span>
              <span className="mt-2 text-muted">{p.tagline}</span>
              <span className="mt-4 flex flex-wrap gap-2">
                {p.tags.map((t) => (
                  <span key={t} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted">
                    {t}
                  </span>
                ))}
              </span>
              <span className="mt-6 font-medium text-accent group-hover:underline">
                Open live demo →
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-16 text-muted">
        Need something like this?{" "}
        <a href={site.fiverrUrl} className="font-medium text-accent underline">
          Hire me on Fiverr
        </a>{" "}
        or browse the{" "}
        <a href={site.repoUrl} className="font-medium text-accent underline">
          source code
        </a>
        .
      </p>
    </main>
  );
}
