import { createFileRoute, Link } from "@tanstack/react-router";
import { CHANGELOG } from "@/lib/changelog";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";

export const Route = createFileRoute("/whats-new")({
  head: () => ({
    meta: [
      { title: "What's New — PurposeDriven NoteTaking APP" },
      {
        name: "description",
        content:
          "Latest PurposeDriven NoteTaking APP release notes — new features, improvements, and fixes for the doorman handoff board.",
      },
      { property: "og:title", content: "What's New — PurposeDriven NoteTaking APP" },
      {
        property: "og:description",
        content:
          "Latest PurposeDriven NoteTaking APP release notes — new features, improvements, and fixes.",
      },
    ],
  }),
  component: PublicChangelogPage,
});

function PublicChangelogPage() {
  const latest = CHANGELOG[0];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.3em] text-muted-foreground hover:underline"
        >
          <ArrowLeft className="h-3 w-3" /> Home
        </Link>

        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
          <Sparkles className="h-3.5 w-3.5" /> Latest release
        </div>
        <h1 className="mt-4 text-4xl font-bold tracking-tight">
          What's new in PurposeDriven NoteTaking APP
        </h1>
        <p className="mt-2 text-muted-foreground">
          A short summary of the most recent release. Administrators can view
          the full version history.
        </p>

        {latest && (
          <article className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-2xl font-bold">v{latest.version}</h2>
              <time className="text-xs uppercase tracking-wider text-muted-foreground">
                {latest.date}
              </time>
            </div>
            {latest.title && (
              <p className="mt-1 text-sm font-semibold text-primary">
                {latest.title}
              </p>
            )}
            {latest.sections.map((s) => (
              <section key={s.heading} className="mt-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {s.heading}
                </h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {s.items.map((it, i) => (
                    <li key={i}>{it}</li>
                  ))}
                </ul>
              </section>
            ))}
          </article>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            to="/changelog"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            View full version history <ArrowRight className="h-4 w-4" />
          </Link>
          <span className="text-xs text-muted-foreground">
            Admin sign-in required for the complete log.
          </span>
        </div>
      </div>
    </main>
  );
}