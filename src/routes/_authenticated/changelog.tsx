import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { CHANGELOG, type ChangelogEntry } from "@/lib/changelog";
import { getMyAdminContext } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/changelog")({
  head: () => ({
    meta: [
      { title: "Changelog — Tasks" },
      { name: "description", content: "Release notes and feature history for Tasks." },
    ],
  }),
  component: ChangelogPage,
});

function ChangelogPage() {
  const navigate = useNavigate();
  const fetchCtx = useServerFn(getMyAdminContext);
  const ctx = useQuery({ queryKey: ["admin", "ctx"], queryFn: () => fetchCtx() });

  if (ctx.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!ctx.data?.isAdmin) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <h1 className="text-2xl font-bold">Admin access required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The changelog is restricted to administrators.
        </p>
        <button onClick={() => navigate({ to: "/" })} className="mt-4 text-sm underline">
          Go home
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link to="/admin" className="text-xs uppercase tracking-[0.3em] text-muted-foreground hover:underline">
          ← Admin
        </Link>
        <h1 className="mt-4 text-4xl font-bold tracking-tight">Changelog</h1>
        <p className="mt-2 text-muted-foreground">
          Everything new, improved, and fixed in Tasks.
        </p>

        <div className="mt-10 space-y-10">
          {CHANGELOG.map((entry) => (
            <Entry key={entry.version} entry={entry} />
          ))}
        </div>
      </div>
    </main>
  );
}

function Entry({ entry }: { entry: ChangelogEntry }) {
  return (
    <article className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-2xl font-bold">v{entry.version}</h2>
        <time className="text-xs uppercase tracking-wider text-muted-foreground">{entry.date}</time>
      </div>
      {entry.title && <p className="mt-1 text-sm font-semibold text-primary">{entry.title}</p>}
      {entry.sections.map((s) => (
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
  );
}
