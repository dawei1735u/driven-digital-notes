import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Returns whether the current user is an admin (and basic role list). */
export const getMyAdminContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const supabase = context.supabase as any;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const list = (roles ?? []).map((r: { role: string }) => r.role);
    const { data: anyAdminData } = await supabase.rpc("has_any_admin");
    return {
      userId,
      roles: list,
      isAdmin: list.includes("admin"),
      anyAdminExists: Boolean(anyAdminData),
    };
  });

/** Returns whether the current signed-in user is permitted to access the app.
 *  Used by the route guard to immediately sign-out un-approved users. */
export const getMyAccessStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const supabase = context.supabase as any;
    const { data, error } = await supabase.rpc("is_user_allowed", {
      _user_id: userId,
    });
    if (error) throw new Error(error.message);
    return { allowed: Boolean(data) };
  });

/** Admin-only: list invited / approved emails. */
export const adminListAllowedUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const supabase = context.supabase as any;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("allowed_users")
      .select("email, note, created_at, invited_by")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { users: data ?? [] };
  });

/** Admin-only: invite/approve a new email. */
export const adminInviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().email().max(254),
        note: z.string().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const supabase = context.supabase as any;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("allowed_users")
      .upsert(
        { email: data.email, note: data.note ?? null, invited_by: userId },
        { onConflict: "email" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin-only: remove an email from the allowlist. Does NOT delete the
 *  underlying auth user; the route guard will sign them out on next access. */
export const adminRevokeUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ email: z.string().email().max(254) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const supabase = context.supabase as any;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("allowed_users")
      .delete()
      .eq("email", data.email.toLowerCase());
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Bootstrap: lets the very first signed-in user claim the admin role
 *  if no admin exists yet. After that, only admins can grant roles. */
export const claimFirstAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const supabase = context.supabase as any;
    const { data: anyAdminData } = await supabase.rpc("has_any_admin");
    if (anyAdminData) throw new Error("An admin already exists.");
    // Bootstrap insert must bypass RLS (the user_roles_admin_manage policy
    // only lets existing admins insert). Safe because we just verified that
    // no admin exists yet.
    const { error } = await (supabaseAdmin as any)
      .from("user_roles")
      .insert({ user_id: userId, role: "admin" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin-only: list notes with optional filters. */
export const adminListNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        status: z.enum(["all", "open", "resolved"]).default("all"),
        search: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const supabase = context.supabase as any;
    const { data: isAdminData } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdminData) throw new Error("Forbidden");

    let q = supabase
      .from("notes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.search && data.search.trim()) {
      const s = `%${data.search.trim()}%`;
      q = q.or(
        `apartment.ilike.${s},written_by.ilike.${s},transcribed_text.ilike.${s},category.ilike.${s}`,
      );
    }
    const { data: notes, error } = await q;
    if (error) throw new Error(error.message);
    return { notes: notes ?? [] };
  });

const idsSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (!data) throw new Error("Forbidden");
}

export const adminBulkResolve = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const supabase = context.supabase as any;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("notes")
      .update({ status: "resolved" })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ids.length };
  });

export const adminBulkReopen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const supabase = context.supabase as any;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("notes")
      .update({ status: "open" })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ids.length };
  });

export const adminBulkDelete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const supabase = context.supabase as any;
    await assertAdmin(supabase, userId);
    const { error } = await supabase.from("notes").delete().in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ids.length };
  });

export const adminUpdateNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        patch: z
          .object({
            apartment: z.string().max(120).nullable().optional(),
            category: z.string().max(120).nullable().optional(),
            shift: z.string().max(60).optional(),
            written_by: z.string().max(120).optional(),
            status: z.enum(["open", "resolved"]).optional(),
            transcribed_text: z.string().max(5000).nullable().optional(),
          })
          .strict(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const supabase = context.supabase as any;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("notes")
      .update(data.patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminGetStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const supabase = context.supabase as any;
    await assertAdmin(supabase, userId);
    const { data: notes, error } = await supabase
      .from("notes")
      .select("id,status,shift,category,created_at,display_date");
    if (error) throw new Error(error.message);
    const all = notes ?? [];
    const today = new Date().toISOString().slice(0, 10);
    const byShift: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byDay: Record<string, number> = {};
    let open = 0;
    let resolved = 0;
    let todayCount = 0;
    for (const n of all) {
      if (n.status === "open") open++;
      else if (n.status === "resolved") resolved++;
      byShift[n.shift ?? "unknown"] = (byShift[n.shift ?? "unknown"] ?? 0) + 1;
      const cat = n.category ?? "uncategorized";
      byCategory[cat] = (byCategory[cat] ?? 0) + 1;
      const d = (n.display_date ?? "").slice(0, 10);
      if (d) byDay[d] = (byDay[d] ?? 0) + 1;
      if (d === today) todayCount++;
    }
    return {
      total: all.length,
      open,
      resolved,
      today: todayCount,
      byShift,
      byCategory,
      byDay,
    };
  });

/** Admin-only: backup health snapshot.
 *  Lovable Cloud (Supabase) takes managed daily backups of the Postgres
 *  database and keeps storage objects redundantly. This function surfaces
 *  the data points the admin can actually verify from the app: most recent
 *  write, totals, and storage object counts. */
export const adminGetBackupStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const supabase = context.supabase as any;
    await assertAdmin(supabase, userId);

    const [notesCountRes, latestNoteRes, oldestNoteRes, allowedCountRes] =
      await Promise.all([
        supabase.from("notes").select("id", { count: "exact", head: true }),
        supabase
          .from("notes")
          .select("created_at")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("notes")
          .select("created_at")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("allowed_users")
          .select("email", { count: "exact", head: true }),
      ]);

    // Storage object listing requires the admin client (RLS on storage).
    let imageCount: number | null = null;
    let latestImageAt: string | null = null;
    try {
      const { data: objects } = await (supabaseAdmin as any).storage
        .from("note-images")
        .list("", { limit: 1000, sortBy: { column: "created_at", order: "desc" } });
      if (Array.isArray(objects)) {
        imageCount = objects.length;
        latestImageAt = objects[0]?.created_at ?? null;
      }
    } catch {
      // Storage list failure is non-fatal — surface as null.
    }

    const now = Date.now();
    const latestNoteAt = latestNoteRes.data?.created_at ?? null;
    const hoursSinceLastNote = latestNoteAt
      ? Math.round((now - new Date(latestNoteAt).getTime()) / 36e5)
      : null;

    return {
      checkedAt: new Date().toISOString(),
      provider: "Lovable Cloud (managed daily backups)",
      database: {
        notesTotal: notesCountRes.count ?? 0,
        latestNoteAt,
        oldestNoteAt: oldestNoteRes.data?.created_at ?? null,
        hoursSinceLastNote,
        approvedUsers: allowedCountRes.count ?? 0,
      },
      storage: {
        bucket: "note-images",
        imageCount,
        latestImageAt,
      },
    };
  });

/** Admin-only: per-day backup activity for the last N days.
 *  Returns notes created and storage uploads per day, plus the
 *  staleness (hours since the most recent write at end-of-day) so the
 *  admin can see the historical "hours since last note" trend. */
export const adminGetBackupHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ days: z.union([z.literal(7), z.literal(30)]).default(7) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const supabase = context.supabase as any;
    await assertAdmin(supabase, userId);

    const days = data.days;
    const now = new Date();
    const startMs = now.getTime() - days * 24 * 3600_000;
    const startISO = new Date(startMs).toISOString();

    const { data: notes, error: notesErr } = await supabase
      .from("notes")
      .select("created_at")
      .gte("created_at", startISO)
      .order("created_at", { ascending: true });
    if (notesErr) throw new Error(notesErr.message);

    let storageObjects: Array<{ created_at?: string | null }> = [];
    try {
      const { data: objs } = await (supabaseAdmin as any).storage
        .from("note-images")
        .list("", { limit: 1000, sortBy: { column: "created_at", order: "asc" } });
      if (Array.isArray(objs)) storageObjects = objs;
    } catch {
      // non-fatal
    }

    // Build day buckets keyed by YYYY-MM-DD (UTC).
    const series: Array<{
      date: string;
      notesCreated: number;
      imagesUploaded: number;
      lastNoteAt: string | null;
      lastImageAt: string | null;
      noteHoursStale: number | null;
      imageHoursStale: number | null;
    }> = [];

    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const startOfDayUTC = (offsetDays: number) => {
      const d = new Date(now);
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() - offsetDays);
      return d;
    };

    // Track running "last seen" across days for staleness carry-over.
    let lastNoteSeen: number | null = null;
    let lastImageSeen: number | null = null;

    const noteByDay = new Map<string, { count: number; lastAt: number }>();
    for (const n of notes ?? []) {
      if (!n.created_at) continue;
      const t = new Date(n.created_at).getTime();
      const k = dayKey(new Date(t));
      const cur = noteByDay.get(k) ?? { count: 0, lastAt: 0 };
      cur.count += 1;
      if (t > cur.lastAt) cur.lastAt = t;
      noteByDay.set(k, cur);
    }

    const imgByDay = new Map<string, { count: number; lastAt: number }>();
    for (const o of storageObjects) {
      if (!o.created_at) continue;
      const t = new Date(o.created_at).getTime();
      const k = dayKey(new Date(t));
      const cur = imgByDay.get(k) ?? { count: 0, lastAt: 0 };
      cur.count += 1;
      if (t > cur.lastAt) cur.lastAt = t;
      imgByDay.set(k, cur);
    }

    for (let i = days - 1; i >= 0; i--) {
      const dayStart = startOfDayUTC(i);
      const k = dayKey(dayStart);
      const endOfDay = dayStart.getTime() + 24 * 3600_000 - 1;
      const refTime = Math.min(endOfDay, now.getTime());

      const noteEntry = noteByDay.get(k);
      if (noteEntry) lastNoteSeen = Math.max(lastNoteSeen ?? 0, noteEntry.lastAt);
      const imgEntry = imgByDay.get(k);
      if (imgEntry) lastImageSeen = Math.max(lastImageSeen ?? 0, imgEntry.lastAt);

      series.push({
        date: k,
        notesCreated: noteEntry?.count ?? 0,
        imagesUploaded: imgEntry?.count ?? 0,
        lastNoteAt: lastNoteSeen ? new Date(lastNoteSeen).toISOString() : null,
        lastImageAt: lastImageSeen ? new Date(lastImageSeen).toISOString() : null,
        noteHoursStale:
          lastNoteSeen != null
            ? Math.max(0, Math.round((refTime - lastNoteSeen) / 36e5))
            : null,
        imageHoursStale:
          lastImageSeen != null
            ? Math.max(0, Math.round((refTime - lastImageSeen) / 36e5))
            : null,
      });
    }

    return { days, series };
  });