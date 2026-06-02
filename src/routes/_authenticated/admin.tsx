import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  adminBulkDelete,
  adminBulkReopen,
  adminBulkResolve,
  adminGetBackupHistory,
  adminGetBackupStatus,
  adminGetStats,
  adminInviteUser,
  adminListAllowedUsers,
  adminListNotes,
  adminRevokeUser,
  claimFirstAdmin,
  getMyAdminContext,
} from "@/lib/admin.functions";
import { ocrBackfillAll } from "@/lib/ocr.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin Panel — Tasks" },
      { name: "description", content: "Manage notes, view stats, and run bulk actions." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchCtx = useServerFn(getMyAdminContext);
  const fetchStats = useServerFn(adminGetStats);
  const fetchBackup = useServerFn(adminGetBackupStatus);
  const fetchBackupHistory = useServerFn(adminGetBackupHistory);
  const fetchNotes = useServerFn(adminListNotes);
  const claim = useServerFn(claimFirstAdmin);
  const bulkResolve = useServerFn(adminBulkResolve);
  const bulkReopen = useServerFn(adminBulkReopen);
  const bulkDelete = useServerFn(adminBulkDelete);
  const fetchAllowed = useServerFn(adminListAllowedUsers);
  const inviteUser = useServerFn(adminInviteUser);
  const revokeUser = useServerFn(adminRevokeUser);

  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved">("all");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const ctx = useQuery({ queryKey: ["admin", "ctx"], queryFn: () => fetchCtx() });

  const isAdmin = ctx.data?.isAdmin ?? false;
  const anyAdmin = ctx.data?.anyAdminExists ?? true;

  const stats = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => fetchStats(),
    enabled: isAdmin,
  });

  const backup = useQuery({
    queryKey: ["admin", "backup"],
    queryFn: () => fetchBackup(),
    enabled: isAdmin,
    refetchInterval: 60_000,
  });

  const [historyRange, setHistoryRange] = useState<7 | 30>(7);
  const backupHistory = useQuery({
    queryKey: ["admin", "backup-history", historyRange],
    queryFn: () => fetchBackupHistory({ data: { days: historyRange } }),
    enabled: isAdmin,
    refetchInterval: 5 * 60_000,
  });

  const notesQ = useQuery({
    queryKey: ["admin", "notes", statusFilter, search, fromDate, toDate],
    queryFn: () =>
      fetchNotes({
        data: {
          status: statusFilter,
          search,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          limit: 200,
        },
      }),
    enabled: isAdmin,
  });

  const allowedQ = useQuery({
    queryKey: ["admin", "allowed"],
    queryFn: () => fetchAllowed(),
    enabled: isAdmin,
  });

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteNote, setInviteNote] = useState("");
  const [inviteWorkspace, setInviteWorkspace] = useState<"shared" | "solo">("shared");
  const [inviteBusy, setInviteBusy] = useState(false);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteBusy(true);
    try {
      await inviteUser({
        data: {
          email: inviteEmail.trim(),
          note: inviteNote.trim() || undefined,
          workspace: inviteWorkspace,
        },
      });
      setInviteEmail("");
      setInviteNote("");
      setInviteWorkspace("shared");
      await queryClient.invalidateQueries({ queryKey: ["admin", "allowed"] });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to invite");
    } finally {
      setInviteBusy(false);
    }
  }

  async function handleRevoke(email: string) {
    if (!confirm(`Revoke access for ${email}? They will be signed out next time they hit the app.`)) return;
    try {
      await revokeUser({ data: { email } });
      await queryClient.invalidateQueries({ queryKey: ["admin", "allowed"] });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to revoke");
    }
  }

  const notes = notesQ.data?.notes ?? [];
  const allSelected = notes.length > 0 && selected.size === notes.length;

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }
  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(notes.map((n: { id: string }) => n.id)));
  }

  async function refreshAll() {
    setSelected(new Set());
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "notes"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] }),
    ]);
  }

  async function runBulk(action: "resolve" | "reopen" | "delete") {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    if (action === "delete" && !confirm(`Delete ${ids.length} note(s)? This cannot be undone.`)) return;
    try {
      if (action === "resolve") await bulkResolve({ data: { ids } });
      else if (action === "reopen") await bulkReopen({ data: { ids } });
      else await bulkDelete({ data: { ids } });
      await refreshAll();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Action failed");
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  if (ctx.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <h1 className="text-2xl font-bold">Admin access required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account ({ctx.data?.userId.slice(0, 8)}…) does not have the admin role.
        </p>
        {!anyAdmin ? (
          <div className="mt-6 rounded-lg border border-border bg-card p-4">
            <p className="text-sm">
              No admins exist yet. You can claim the first admin role for this workspace.
            </p>
            <button
              onClick={async () => {
                try {
                  await claim();
                  await ctx.refetch();
                } catch (e) {
                  alert(e instanceof Error ? e.message : "Failed");
                }
              }}
              className="mt-3 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
            >
              Claim admin role
            </button>
          </div>
        ) : (
          <p className="mt-6 text-sm">Ask an existing admin to grant you access.</p>
        )}
        <div className="mt-6 flex gap-3 text-sm">
          <Link to="/" className="underline">Home</Link>
          <button onClick={signOut} className="underline">Sign out</button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/40">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Admin</p>
            <h1 className="text-xl font-bold">Tasks Control Panel</h1>
          </div>
          <nav className="flex items-center gap-3 text-sm">
            <Link to="/monitor" className="text-muted-foreground hover:underline">Tasks Board</Link>
            <Link to="/ipad" className="text-muted-foreground hover:underline">Write Task</Link>
            <Link to="/changelog" className="text-muted-foreground hover:underline">Changelog</Link>
            <button onClick={signOut} className="rounded-md border border-border px-3 py-1.5 text-xs">
              Sign out
            </button>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-6">
        <StatsGrid stats={stats.data} loading={stats.isLoading} />
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-6">
        <BackupStatus
          data={backup.data}
          loading={backup.isLoading}
          error={backup.error instanceof Error ? backup.error.message : null}
          onRefresh={() => backup.refetch()}
          refreshing={backup.isFetching}
        />
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-6">
        <BackupHistoryChart
          data={backupHistory.data}
          loading={backupHistory.isLoading}
          range={historyRange}
          onRangeChange={setHistoryRange}
        />
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-6">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Approved users</h2>
              <p className="text-xs text-muted-foreground">
                Only emails on this list can sign in. Anyone else is signed out automatically.
              </p>
            </div>
          </div>

          <form onSubmit={handleInvite} className="mt-4 flex flex-wrap items-center gap-2">
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@example.com"
              className="w-64 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            />
            <input
              type="text"
              value={inviteNote}
              onChange={(e) => setInviteNote(e.target.value)}
              placeholder="Note (optional)"
              className="w-56 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            />
            <select
              value={inviteWorkspace}
              onChange={(e) => setInviteWorkspace(e.target.value as "shared" | "solo")}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              title="Workspace"
            >
              <option value="shared">Shared doorman board</option>
              <option value="solo">Private (their own instance)</option>
            </select>
            <button
              type="submit"
              disabled={inviteBusy}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {inviteBusy ? "…" : "Invite"}
            </button>
          </form>

          <div className="mt-4 overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Workspace</th>
                  <th className="px-3 py-2 text-left">Note</th>
                  <th className="px-3 py-2 text-left">Added</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {allowedQ.isLoading && (
                  <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Loading…</td></tr>
                )}
                {!allowedQ.isLoading && (allowedQ.data?.users.length ?? 0) === 0 && (
                  <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No invited users yet.</td></tr>
                )}
                {allowedQ.data?.users.map((u: { email: string; note: string | null; created_at: string; workspace?: string }) => (
                  <tr key={u.email} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{u.email}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${
                        u.workspace === "solo"
                          ? "bg-violet-100 text-violet-900"
                          : "bg-sky-100 text-sky-900"
                      }`}>
                        {u.workspace === "solo" ? "Private" : "Shared"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{u.note ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => handleRevoke(u.email)}
                        className="rounded-md border border-border px-2 py-1 text-xs hover:bg-destructive hover:text-destructive-foreground"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-12">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {(["all", "open", "resolved"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full border px-3 py-1 text-xs capitalize ${
                statusFilter === s
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border"
              }`}
            >
              {s}
            </button>
          ))}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search apartment, author, text…"
            className="ml-2 w-64 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
          <label className="ml-2 flex items-center gap-1 text-xs text-muted-foreground">
            From
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            To
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
            />
          </label>
          {(fromDate || toDate) && (
            <button
              onClick={() => { setFromDate(""); setToDate(""); }}
              className="rounded-md border border-border px-2 py-1 text-xs"
            >
              Clear dates
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button
              disabled={selected.size === 0}
              onClick={() => runBulk("resolve")}
              className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-40"
            >
              Resolve ({selected.size})
            </button>
            <button
              disabled={selected.size === 0}
              onClick={() => runBulk("reopen")}
              className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-40"
            >
              Reopen
            </button>
            <button
              disabled={selected.size === 0}
              onClick={() => runBulk("delete")}
              className="rounded-md bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground disabled:opacity-40"
            >
              Delete
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                </th>
                <th className="px-3 py-2 text-left">Apartment</th>
                <th className="px-3 py-2 text-left">By</th>
                <th className="px-3 py-2 text-left">Shift</th>
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Note</th>
              </tr>
            </thead>
            <tbody>
              {notesQ.isLoading && (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {!notesQ.isLoading && notes.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No notes match.</td></tr>
              )}
              {notes.map((n: any) => (
                <tr key={n.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(n.id)}
                      onChange={() => toggle(n.id)}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">{n.apartment ?? "—"}</td>
                  <td className="px-3 py-2">{n.written_by}</td>
                  <td className="px-3 py-2">{n.shift}</td>
                  <td className="px-3 py-2">{n.category ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      n.status === "open" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"
                    }`}>{n.status}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{(n.display_date ?? "").slice(0, 10)}</td>
                  <td className="px-3 py-2 max-w-xs truncate text-muted-foreground">{n.transcribed_text ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function StatsGrid({ stats, loading }: { stats: any; loading: boolean }) {
  const cards = useMemo(
    () => [
      { label: "Total notes", value: stats?.total ?? "—" },
      { label: "Open", value: stats?.open ?? "—" },
      { label: "Resolved", value: stats?.resolved ?? "—" },
      { label: "Today", value: stats?.today ?? "—" },
    ],
    [stats],
  );
  return (
    <div className="grid gap-3 md:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{c.label}</p>
          <p className="mt-2 text-2xl font-bold">{loading ? "…" : c.value}</p>
        </div>
      ))}
      {stats && (
        <>
          <BreakdownCard title="By shift" map={stats.byShift} />
          <BreakdownCard title="By category" map={stats.byCategory} />
          <BreakdownCard title="By day" map={stats.byDay} max={7} />
        </>
      )}
    </div>
  );
}

function BreakdownCard({ title, map, max }: { title: string; map: Record<string, number>; max?: number }) {
  const entries = Object.entries(map ?? {}).sort((a, b) => b[1] - a[1]).slice(0, max ?? 6);
  return (
    <div className="rounded-lg border border-border bg-card p-4 md:col-span-2">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{title}</p>
      <ul className="mt-2 space-y-1 text-sm">
        {entries.length === 0 && <li className="text-muted-foreground">No data</li>}
        {entries.map(([k, v]) => (
          <li key={k} className="flex justify-between">
            <span className="capitalize">{k}</span>
            <span className="font-semibold">{v}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BackupStatus({
  data,
  loading,
  error,
  onRefresh,
  refreshing,
}: {
  data: any;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString() : "—";

  const hours = data?.database?.hoursSinceLastNote;
  const freshness =
    hours == null
      ? { label: "No data", tone: "bg-muted text-foreground" }
      : hours <= 24
      ? { label: "Healthy", tone: "bg-emerald-100 text-emerald-900" }
      : hours <= 72
      ? { label: "Stale", tone: "bg-amber-100 text-amber-900" }
      : { label: "Inactive", tone: "bg-rose-100 text-rose-900" };

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Backup status</h2>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${freshness.tone}`}>
              {freshness.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {data?.provider ?? "Lovable Cloud (managed daily backups)"} · last checked{" "}
            {data ? fmt(data.checkedAt) : "—"}
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Stat label="Notes in DB" value={loading ? "…" : data?.database?.notesTotal ?? "—"} />
        <Stat
          label="Last note"
          value={loading ? "…" : fmt(data?.database?.latestNoteAt)}
          hint={
            hours == null
              ? undefined
              : hours < 1
              ? "moments ago"
              : `${hours}h ago`
          }
        />
        <Stat label="Approved users" value={loading ? "…" : data?.database?.approvedUsers ?? "—"} />
        <Stat
          label={`Storage · ${data?.storage?.bucket ?? "note-images"}`}
          value={loading ? "…" : data?.storage?.imageCount ?? "—"}
          hint={
            data?.storage?.latestImageAt
              ? `latest ${fmt(data.storage.latestImageAt)}`
              : undefined
          }
        />
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Daily database backups and redundant object storage are handled by Lovable Cloud.
        This panel surfaces the data points you can verify directly from the app: row totals,
        most recent write activity, and storage object counts. If "Last note" stops advancing,
        the iPad client may be offline.
      </p>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: any; hint?: string }) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{String(value)}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function BackupHistoryChart({
  data,
  loading,
  range,
  onRangeChange,
}: {
  data: { days: number; series: Array<any> } | undefined;
  loading: boolean;
  range: 7 | 30;
  onRangeChange: (r: 7 | 30) => void;
}) {
  const series = (data?.series ?? []).map((d) => ({
    ...d,
    label:
      range === 7
        ? new Date(d.date).toLocaleDateString(undefined, { weekday: "short" })
        : d.date.slice(5), // MM-DD
  }));

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Backup activity history</h2>
          <p className="text-xs text-muted-foreground">
            Per-day notes &amp; image uploads, with end-of-day staleness (hours since the
            last write).
          </p>
        </div>
        <div className="flex gap-1 rounded-md border border-border p-0.5 text-xs">
          {([7, 30] as const).map((r) => (
            <button
              key={r}
              onClick={() => onRangeChange(r)}
              className={`rounded px-2 py-1 ${
                range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 h-72 w-full">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : series.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No activity in this window.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={series} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis
                yAxisId="left"
                allowDecimals={false}
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
                label={{ value: "writes", angle: -90, position: "insideLeft", fontSize: 11 }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                allowDecimals={false}
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
                label={{ value: "hours stale", angle: 90, position: "insideRight", fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={(value: any, name: string, p: any) => {
                  if (name === "Last note" || name === "Last image") {
                    const iso =
                      name === "Last note" ? p.payload.lastNoteAt : p.payload.lastImageAt;
                    return [iso ? new Date(iso).toLocaleString() : "—", name];
                  }
                  return [value, name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                yAxisId="left"
                dataKey="notesCreated"
                name="Notes created"
                fill="hsl(var(--primary))"
                radius={[3, 3, 0, 0]}
              />
              <Bar
                yAxisId="left"
                dataKey="imagesUploaded"
                name="Images uploaded"
                fill="hsl(var(--muted-foreground))"
                radius={[3, 3, 0, 0]}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="noteHoursStale"
                name="Note hours stale"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="imageHoursStale"
                name="Image hours stale"
                stroke="#ef4444"
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Bars show write counts per day. Lines show end-of-day staleness — how many hours had
        passed since the most recent note / image upload at that point. Lower is fresher.
      </p>
    </div>
  );
}