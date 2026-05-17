import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { NoteCard } from "@/components/NoteCard";
import { EditNoteDialog } from "@/components/EditNoteDialog";
import { Minus, Plus, PenLine, Home, Filter, LogOut, Mic, LayoutGrid } from "lucide-react";

type Note = Tables<"notes">;

/** Extract the storage path from either a full public URL (legacy rows)
 *  or a bare path (new rows). Returns null if unparseable. */
function pathFromImageUrl(image_url: string | null | undefined): string | null {
  if (!image_url) return null;
  if (!image_url.startsWith("http")) return image_url;
  const m = image_url.match(/\/note-images\/(.+?)(?:\?.*)?$/);
  return m ? m[1] : null;
}

export const Route = createFileRoute("/_authenticated/monitor")({
  head: () => ({
    meta: [
      { title: "Tasks" },
      {
        name: "description",
        content: "Live wall of open tasks.",
      },
    ],
  }),
  component: MonitorPage,
});

const NOTE_ASPECT = 3 / 3.5; // height / width to roughly match sticky note
const BOARD_PADDING = 32;

function autoLayout(notes: Note[], width: number, boardWidth: number) {
  // Cascade default positions for notes that don't have one yet
  const gap = 24;
  const cols = Math.max(1, Math.floor((boardWidth - BOARD_PADDING * 2 + gap) / (width + gap)));
  let i = 0;
  return notes.map((n) => {
    if (n.position_x != null && n.position_y != null) return n;
    const col = i % cols;
    const row = Math.floor(i / cols);
    i++;
    return {
      ...n,
      position_x: BOARD_PADDING + col * (width + gap),
      position_y: BOARD_PADDING + row * (width * NOTE_ASPECT + gap + 80),
    };
  });
}

function MonitorPage() {
  // (component below)
  return <MonitorPageInner />;
}

function FilterGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const all = ["all", ...options];
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs uppercase tracking-wider text-white/40">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {all.map((opt) => {
          const active = value === opt;
          return (
            <button
              key={opt}
              onClick={() => onChange(opt)}
              className={
                "rounded-full border px-2.5 py-1 text-xs font-medium capitalize transition " +
                (active
                  ? "border-amber-300 bg-amber-300 text-black"
                  : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white")
              }
            >
              {opt === "all" ? "All" : opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MonitorPageInner() {
  const navigate = useNavigate();
  const [notes, setNotes] = useState<Note[]>([]);
  const [now, setNow] = useState(new Date());
  const [error, setError] = useState<string | null>(null);
  const [noteSize, setNoteSize] = useState<number>(280);
  const [boardWidth, setBoardWidth] = useState<number>(1200);
  const [statusFilter, setStatusFilter] = useState<"open" | "resolved" | "all">(
    "open",
  );
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [snapToGrid, setSnapToGrid] = useState<boolean>(false);
  const GRID_SIZE = 24;
  const snap = (v: number) => Math.round(v / GRID_SIZE) * GRID_SIZE;
  const boardRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [zOrder, setZOrder] = useState<Record<string, number>>({});
  const zCounterRef = useRef(10);
  const bringToFront = useCallback((id: string) => {
    zCounterRef.current += 1;
    const next = zCounterRef.current;
    setZOrder((m) => (m[id] === next ? m : { ...m, [id]: next }));
  }, []);
  const dragRef = useRef<{
    id: string;
    offsetX: number;
    offsetY: number;
    pointerId: number;
  } | null>(null);
  const resizeRef = useRef<{
    id: string;
    startX: number;
    startWidth: number;
    pointerId: number;
  } | null>(null);
  const pinchRef = useRef<{
    startDist: number;
    startSize: number;
  } | null>(null);

  const clampSize = (n: number) => Math.min(600, Math.max(180, Math.round(n)));

  // Restore note size
  useEffect(() => {
    const stored = localStorage.getItem("shiftnotes:noteSize");
    if (stored) {
      const n = parseInt(stored, 10);
      if (!Number.isNaN(n) && n >= 180 && n <= 600) setNoteSize(n);
    }
  }, []);
  useEffect(() => {
    localStorage.setItem("shiftnotes:noteSize", String(noteSize));
  }, [noteSize]);

  useEffect(() => {
    const stored = localStorage.getItem("shiftnotes:snapToGrid");
    if (stored === "1") setSnapToGrid(true);
  }, []);
  useEffect(() => {
    localStorage.setItem("shiftnotes:snapToGrid", snapToGrid ? "1" : "0");
  }, [snapToGrid]);

  // Pinch-to-resize: two-finger touch + ctrl+wheel (trackpad pinch)
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;

    const dist = (a: Touch, b: Touch) =>
      Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchRef.current = {
          startDist: dist(e.touches[0], e.touches[1]),
          startSize: noteSize,
        };
        // cancel any in-progress drag
        dragRef.current = null;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const d = dist(e.touches[0], e.touches[1]);
        const ratio = d / pinchRef.current.startDist;
        setNoteSize(clampSize(pinchRef.current.startSize * ratio));
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchRef.current = null;
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return; // trackpad pinch sends ctrlKey
      e.preventDefault();
      setNoteSize((s) => clampSize(s * (1 - e.deltaY * 0.01)));
    };

    board.addEventListener("touchstart", onTouchStart, { passive: true });
    board.addEventListener("touchmove", onTouchMove, { passive: false });
    board.addEventListener("touchend", onTouchEnd);
    board.addEventListener("touchcancel", onTouchEnd);
    board.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      board.removeEventListener("touchstart", onTouchStart);
      board.removeEventListener("touchmove", onTouchMove);
      board.removeEventListener("touchend", onTouchEnd);
      board.removeEventListener("touchcancel", onTouchEnd);
      board.removeEventListener("wheel", onWheel);
    };
  }, [noteSize]);

  // Track board width for auto-layout fallback positions
  useEffect(() => {
    if (!boardRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setBoardWidth(e.contentRect.width);
    });
    ro.observe(boardRef.current);
    return () => ro.disconnect();
  }, []);

  // Fetch + poll
  useEffect(() => {
    let alive = true;
    const fetchNotes = async () => {
      let q = supabase
        .from("notes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (!alive) return;
      if (error) setError(error.message);
      else {
        setError(null);
        const rows = data ?? [];
        const paths = Array.from(
          new Set(
            rows
              .map((n) => pathFromImageUrl(n.image_url))
              .filter((p): p is string => !!p),
          ),
        );
        const urlByPath = new Map<string, string>();
        if (paths.length > 0) {
          const { data: signed } = await supabase.storage
            .from("note-images")
            .createSignedUrls(paths, 3600);
          for (const s of signed ?? []) {
            if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
          }
        }
        const resolved = rows.map((n) => {
          const p = pathFromImageUrl(n.image_url);
          const u = p ? urlByPath.get(p) : null;
          return u ? { ...n, image_url: u } : n;
        });
        // Don't clobber notes mid-drag
        if (!dragRef.current && !resizeRef.current) setNotes(resolved);
      }
    };
    fetchNotes();
    const poll = setInterval(fetchNotes, 5000);
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [statusFilter]);

  const onResolved = (id: string) => {
    if (statusFilter === "open") {
      setNotes((n) => n.filter((x) => x.id !== id));
    } else {
      setNotes((n) =>
        n.map((x) => (x.id === id ? { ...x, status: "resolved" } : x)),
      );
    }
  };

  const onLocalUpdate = useCallback((id: string, patch: Partial<Note>) => {
    setNotes((arr) => arr.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }, []);

  // Drag handling
  const onDragStart = useCallback(
    (id: string, e: React.PointerEvent) => {
      const board = boardRef.current;
      if (!board) return;
      const note = notes.find((n) => n.id === id);
      if (!note) return;
      const boardRect = board.getBoundingClientRect();
      const laidOut = autoLayout(notes, noteSize, boardWidth).find(
        (n) => n.id === id,
      )!;
      const x = laidOut.position_x ?? 0;
      const y = laidOut.position_y ?? 0;
      dragRef.current = {
        id,
        offsetX: e.clientX - boardRect.left - x,
        offsetY: e.clientY - boardRect.top - y,
        pointerId: e.pointerId,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [notes, noteSize, boardWidth],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      const board = boardRef.current;
      if (!drag || !board) return;
      if (e.pointerId !== drag.pointerId) return;
      const boardRect = board.getBoundingClientRect();
      let x = Math.max(0, e.clientX - boardRect.left - drag.offsetX);
      let y = Math.max(0, e.clientY - boardRect.top - drag.offsetY);
      if (snapToGrid) {
        x = snap(x);
        y = snap(y);
      }
      setNotes((arr) =>
        arr.map((n) =>
          n.id === drag.id ? { ...n, position_x: x, position_y: y } : n,
        ),
      );
    };
    const onUp = async (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      const finalNote = notes.find((n) => n.id === drag.id);
      dragRef.current = null;
      if (finalNote) {
        const { error } = await supabase
          .from("notes")
          .update({
            position_x: finalNote.position_x,
            position_y: finalNote.position_y,
          })
          .eq("id", finalNote.id);
        if (error) console.error(error);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [notes, snapToGrid]);

  // Per-note resize handling
  const onResizeStart = useCallback(
    (id: string, e: React.PointerEvent) => {
      const note = notes.find((n) => n.id === id);
      if (!note) return;
      const current = note.width ?? noteSize;
      resizeRef.current = {
        id,
        startX: e.clientX,
        startWidth: current,
        pointerId: e.pointerId,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    },
    [notes, noteSize],
  );

  useEffect(() => {
    const clamp = (n: number) => Math.min(800, Math.max(160, Math.round(n)));
    const onMove = (e: PointerEvent) => {
      const r = resizeRef.current;
      if (!r || e.pointerId !== r.pointerId) return;
      const next = clamp(r.startWidth + (e.clientX - r.startX));
      setNotes((arr) =>
        arr.map((n) => (n.id === r.id ? { ...n, width: next } : n)),
      );
    };
    const onUp = async (e: PointerEvent) => {
      const r = resizeRef.current;
      if (!r || e.pointerId !== r.pointerId) return;
      const finalNote = notes.find((n) => n.id === r.id);
      resizeRef.current = null;
      if (finalNote) {
        const { error } = await supabase
          .from("notes")
          .update({ width: finalNote.width })
          .eq("id", finalNote.id);
        if (error) console.error(error);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [notes]);

  const filtered = notes.filter((n) => {
    const d = (n.display_date ?? "").slice(0, 10);
    if (fromDate && d < fromDate) return false;
    if (toDate && d > toDate) return false;
    return true;
  });

  const tileAll = useCallback(async () => {
    const board = boardRef.current;
    const bw = board?.getBoundingClientRect().width ?? boardWidth;
    const gap = 24;
    const width = noteSize;
    const cols = Math.max(1, Math.floor((bw - BOARD_PADDING * 2 + gap) / (width + gap)));
    const targets = filtered.map((n, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return {
        id: n.id,
        position_x: BOARD_PADDING + col * (width + gap),
        position_y: BOARD_PADDING + row * (width * NOTE_ASPECT + gap + 80),
        width,
      };
    });
    const targetMap = new Map(targets.map((t) => [t.id, t]));
    setNotes((arr) =>
      arr.map((n) => {
        const t = targetMap.get(n.id);
        return t ? { ...n, position_x: t.position_x, position_y: t.position_y, width: t.width } : n;
      }),
    );
    await Promise.all(
      targets.map((t) =>
        supabase
          .from("notes")
          .update({ position_x: t.position_x, position_y: t.position_y, width: t.width })
          .eq("id", t.id),
      ),
    );
  }, [filtered, noteSize, boardWidth]);

  const positioned = autoLayout(filtered, noteSize, boardWidth);
  const boardHeight = Math.max(
    600,
    ...positioned.map(
      (n) => (n.position_y ?? 0) + noteSize * NOTE_ASPECT + 220,
    ),
  );

  return (
    <main
      className="min-h-screen text-white"
      style={{
        background:
          "radial-gradient(circle at 20% 0%, #2a2a2a 0%, #111 60%, #050505 100%)",
      }}
    >
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-8 py-5">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/70 hover:bg-white/10 hover:text-white"
            aria-label="Home"
            title="Home"
          >
            <Home className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Tasks
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-3 rounded-2xl border-2 border-white/20 bg-white/10 px-7 py-4 text-lg font-bold text-white shadow-xl hover:bg-white/20"
          >
            <Home className="h-6 w-6" />
            Return to Main Screen
          </Link>
          <Link
            to="/ipad"
            className="inline-flex items-center gap-3 rounded-2xl bg-amber-300 px-7 py-4 text-lg font-bold text-black shadow-xl ring-2 ring-amber-200/50 hover:bg-amber-200"
          >
            <PenLine className="h-6 w-6" />
            Write New Note
          </Link>
          <Link
            to="/ipad"
            search={{ mode: "voice" }}
            className="inline-flex items-center gap-3 rounded-2xl bg-red-500 px-7 py-4 text-lg font-bold text-white shadow-xl ring-2 ring-red-300/50 hover:bg-red-400"
          >
            <Mic className="h-6 w-6" />
            Voice Note
          </Link>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/" });
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>

          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <button
              onClick={() => setNoteSize((s) => Math.max(180, s - 40))}
              className="rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30"
              disabled={noteSize <= 180}
              aria-label="Smaller notes"
            >
              <Minus className="h-4 w-4" />
            </button>
            <input
              type="range"
              min={180}
              max={600}
              step={20}
              value={noteSize}
              onChange={(e) => setNoteSize(parseInt(e.target.value, 10))}
              className="w-28 accent-amber-300"
              aria-label="Note size"
            />
            <button
              onClick={() => setNoteSize((s) => Math.min(600, s + 40))}
              className="rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30"
              disabled={noteSize >= 600}
              aria-label="Larger notes"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="text-right">
            <div className="text-3xl font-bold tabular-nums">
              <span suppressHydrationWarning>
              {now.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
              </span>
            </div>
            <div className="text-sm text-white/60" suppressHydrationWarning>
              {now.toLocaleDateString([], {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </div>
          </div>
          <div className="text-right">
            <div className="text-5xl font-bold text-amber-300 tabular-nums">
              {filtered.length}
              {filtered.length !== notes.length && (
                <span className="text-xl text-white/40">/{notes.length}</span>
              )}
            </div>
            <div className="text-xs uppercase tracking-widest text-white/60">
              Open notes
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-8 py-3 text-sm">
        <span className="inline-flex items-center gap-1.5 text-white/50">
          <Filter className="h-3.5 w-3.5" /> Filter
        </span>
        <FilterGroup
          label="Status"
          value={statusFilter}
          options={["open", "resolved"]}
          onChange={(v) => setStatusFilter(v as "open" | "resolved" | "all")}
        />
        <div className="flex items-center gap-1.5">
          <span className="text-xs uppercase tracking-wider text-white/40">Date</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white [color-scheme:dark]"
            aria-label="From date"
          />
          <span className="text-xs text-white/40">→</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white [color-scheme:dark]"
            aria-label="To date"
          />
          {(fromDate || toDate) && (
            <button
              onClick={() => { setFromDate(""); setToDate(""); }}
              className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>
        <button
          onClick={() => setSnapToGrid((s) => !s)}
          className={
            "ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition " +
            (snapToGrid
              ? "border-amber-300 bg-amber-300 text-black"
              : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white")
          }
          title="Snap notes to a 24px grid when dragging or tiling"
          aria-pressed={snapToGrid}
        >
          <LayoutGrid className="h-3.5 w-3.5" /> Snap to grid {snapToGrid ? "on" : "off"}
        </button>
        <button
          onClick={tileAll}
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-300/20"
          title="Arrange all notes in a grid"
        >
          <LayoutGrid className="h-3.5 w-3.5" /> Tile notes
        </button>
      </div>

      <section className="p-2">
        {error && (
          <div className="m-6 rounded-md bg-red-900/40 px-4 py-3 text-sm text-red-100">
            Failed to load notes: {error}
          </div>
        )}

        {notes.length === 0 && !error ? (
          <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
            <p className="text-2xl font-semibold text-white/80">
              No open notes right now.
            </p>
            <p className="mt-2 text-white/50">
              When the team writes a note on the iPad, it will appear here.
            </p>
            <Link
              to="/ipad"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-amber-300 px-5 py-3 font-bold text-black hover:bg-amber-200"
            >
              <PenLine className="h-4 w-4" /> Open iPad writer →
            </Link>
          </div>
        ) : (
          <div
            ref={boardRef}
            className="relative w-full overflow-hidden rounded-2xl"
            style={{
              minHeight: boardHeight,
              backgroundImage:
                "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          >
            {positioned.map((n) => (
              <div
                key={n.id}
                style={{
                  position: "absolute",
                  left: n.position_x ?? 0,
                  top: n.position_y ?? 0,
                  zIndex: dragRef.current?.id === n.id ? 50 : 1,
                  transition:
                    dragRef.current?.id === n.id
                      ? "none"
                      : "left 120ms ease, top 120ms ease",
                }}
              >
                <NoteCard
                  note={n}
                  width={n.width ?? noteSize}
                  onResolved={onResolved}
                  onDragStart={onDragStart}
                  onLocalUpdate={onLocalUpdate}
                  onEdit={(id) => setEditingId(id)}
                  onResizeStart={onResizeStart}
                />
              </div>
            ))}
          </div>
        )}
      </section>
      <EditNoteDialog
        note={notes.find((n) => n.id === editingId) ?? null}
        open={editingId !== null}
        onOpenChange={(v) => !v && setEditingId(null)}
        onSaved={(patch) => {
          if (!editingId) return;
          onLocalUpdate(editingId, patch);
        }}
      />
    </main>
  );
}
