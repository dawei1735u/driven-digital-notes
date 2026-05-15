import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { PenLine, Monitor } from "lucide-react";
import daveLogo from "@/assets/dave-logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ShiftNotes — Digital Doorman Shift Handoff" },
      {
        name: "description",
        content:
          "Handwritten shift notes for doorman and front-desk staff. Write on iPad, view on the lobby monitor.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 py-16">
        <nav className="absolute right-6 top-6 flex gap-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">
          <Link to="/admin" className="hover:text-foreground">Admin</Link>
        </nav>
        <div className="mb-12 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            Future Solutions Digital Notes
          </p>
          <h1 className="text-5xl font-bold tracking-tight md:text-7xl">
            Digital<span className="text-primary">Notes</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            Handwritten shift handoff notes — written on the iPad, instantly visible
            on the lobby monitor.
          </p>
        </div>

        <div className="grid w-full gap-6 md:grid-cols-2">
          <Link
            to="/ipad"
            className="group relative overflow-hidden rounded-3xl p-10 shadow-xl transition-transform hover:-translate-y-1"
            style={{
              background:
                "linear-gradient(135deg, var(--sticky-yellow) 0%, var(--sticky-yellow-deep) 100%)",
              transform: "rotate(-1.2deg)",
            }}
          >
            <PenLine className="mb-6 h-10 w-10 text-[var(--ink)]" />
            <h2 className="text-3xl font-bold text-[var(--ink)]">Write a Note</h2>
            <p className="mt-2 text-[var(--ink)]/70">
              Open on iPad with Apple Pencil
            </p>
            <div className="mt-8 inline-flex items-center text-sm font-semibold text-[var(--ink)]">
              Open /ipad →
            </div>
          </Link>

          <Link
            to="/monitor"
            className="group relative overflow-hidden rounded-3xl bg-[var(--ink)] p-10 text-white shadow-xl transition-transform hover:-translate-y-1"
            style={{ transform: "rotate(0.8deg)" }}
          >
            <Monitor className="mb-6 h-10 w-10" />
            <h2 className="text-3xl font-bold">Monitor Board</h2>
            <p className="mt-2 text-white/70">
              Live shift handoff dashboard
            </p>
            <div className="mt-8 inline-flex items-center text-sm font-semibold">
              Open /monitor →
            </div>
          </Link>
        </div>

        <footer className="mt-20 flex w-full flex-col items-center text-center">
          <img
            src={daveLogo}
            alt="Design Ambition Vision Excellence monogram"
            className="h-24 w-24 object-contain"
          />
          <p className="mt-4 text-sm font-semibold uppercase tracking-[0.35em] text-foreground md:text-base">
            Design <span className="text-primary">.</span> Ambition{" "}
            <span className="text-primary">.</span> Vision{" "}
            <span className="text-primary">.</span> Excellence
          </p>
        </footer>
      </div>
    </main>
  );
}
