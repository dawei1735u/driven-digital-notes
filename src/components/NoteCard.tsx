import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Check, Clock, Calendar as CalIcon, GripVertical, RotateCcw, Pencil, PenLine, Undo2, Play, Pause, Volume2 } from "lucide-react";

type Strike = { x1: number; y1: number; x2: number; y2: number };

function CornerResizeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} aria-hidden="true">
      <path
        d="M11 5 L5 11 M11 9 L9 11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

type Note = Tables<"notes">;

const STICKY_COLORS = [
  "var(--sticky-yellow)",
  "var(--sticky-pink)",
  "var(--sticky-blue)",
  "var(--sticky-green)",
];

function colorForId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return STICKY_COLORS[Math.abs(hash) % STICKY_COLORS.length];
}

function rotationForId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 17 + id.charCodeAt(i)) | 0;
  // -2.5deg .. +2.5deg
  return ((Math.abs(hash) % 50) / 10 - 2.5).toFixed(2);
}

export function NoteCard({
  note,
  width,
  onResolved,
  onDragStart,
  onLocalUpdate,
  onEdit,
  onResizeStart,
}: {
  note: Note;
  width: number;
  onResolved?: (id: string) => void;
  onDragStart?: (id: string, e: React.PointerEvent) => void;
  onLocalUpdate?: (id: string, patch: Partial<Note>) => void;
  onEdit?: (id: string) => void;
  onResizeStart?: (id: string, e: React.PointerEvent) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [strikeMode, setStrikeMode] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const strikes: Strike[] = Array.isArray((note as unknown as { strikes?: Strike[] }).strikes)
    ? ((note as unknown as { strikes: Strike[] }).strikes)
    : [];
  const imgWrapRef = useRef<HTMLDivElement>(null);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const [tempStrike, setTempStrike] = useState<Strike | null>(null);

  const audioPath = (note as unknown as { audio_url?: string | null }).audio_url ?? null;

  const toggleAudio = async () => {
    if (!audioPath) return;
    if (audioPlaying && audioElRef.current) {
      audioElRef.current.pause();
      return;
    }
    setAudioLoading(true);
    try {
      if (!audioElRef.current) {
        const { data, error } = await supabase.storage
          .from("note-audio")
          .createSignedUrl(audioPath, 3600);
        if (error || !data?.signedUrl) throw error ?? new Error("No signed URL");
        const el = new Audio(data.signedUrl);
        el.onended = () => setAudioPlaying(false);
        el.onpause = () => setAudioPlaying(false);
        el.onplay = () => setAudioPlaying(true);
        audioElRef.current = el;
      }
      await audioElRef.current.play();
    } catch (e) {
      console.error(e);
    } finally {
      setAudioLoading(false);
    }
  };

  const persistStrikes = async (next: Strike[]) => {
    onLocalUpdate?.(note.id, { strikes: next } as unknown as Partial<Note>);
    const { error } = await supabase
      .from("notes")
      .update({ strikes: next } as never)
      .eq("id", note.id);
    if (error) {
      console.error(error);
      onLocalUpdate?.(note.id, { strikes } as unknown as Partial<Note>);
    }
  };

  const getRelPos = (e: React.PointerEvent) => {
    const el = imgWrapRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  };

  const onStrikeDown = (e: React.PointerEvent) => {
    if (!strikeMode) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = getRelPos(e);
    if (!p) return;
    drawStartRef.current = p;
    setTempStrike({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
  };
  const onStrikeMove = (e: React.PointerEvent) => {
    if (!strikeMode || !drawStartRef.current) return;
    const p = getRelPos(e);
    if (!p) return;
    setTempStrike({
      x1: drawStartRef.current.x,
      y1: drawStartRef.current.y,
      x2: p.x,
      y2: p.y,
    });
  };
  const onStrikeUp = () => {
    if (!strikeMode || !tempStrike) {
      drawStartRef.current = null;
      return;
    }
    const dx = tempStrike.x2 - tempStrike.x1;
    const dy = tempStrike.y2 - tempStrike.y1;
    drawStartRef.current = null;
    setTempStrike(null);
    if (Math.hypot(dx, dy) < 0.01) return; // ignore taps
    void persistStrikes([...strikes, tempStrike]);
  };

  const undoStrike = () => {
    if (strikes.length === 0) return;
    void persistStrikes(strikes.slice(0, -1));
  };

  const isResolved = note.status === "resolved";

  const toggleStatus = async () => {
    const next = isResolved ? "open" : "resolved";
    setBusy(true);
    onLocalUpdate?.(note.id, { status: next });
    const { error } = await supabase
      .from("notes")
      .update({ status: next })
      .eq("id", note.id);
    setBusy(false);
    if (!error) onResolved?.(note.id);
    else {
      onLocalUpdate?.(note.id, { status: note.status });
      console.error(error);
    }
  };

  const created = new Date(note.created_at);
  const time = created.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const displayDate = note.display_date
    ? new Date(note.display_date + "T00:00:00")
    : created;
  const dateLabel = displayDate.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });

  const setDisplayDate = async (d: Date | undefined) => {
    if (!d) return;
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    onLocalUpdate?.(note.id, { display_date: iso });
    setDateOpen(false);
    const { error } = await supabase
      .from("notes")
      .update({ display_date: iso })
      .eq("id", note.id);
    if (error) console.error(error);
  };

  return (
    <div
      className="relative flex flex-col p-4 text-[var(--ink)]"
      style={{
        width,
        background: colorForId(note.id),
        transform: `rotate(${rotationForId(note.id)}deg)`,
        borderRadius: "4px",
        boxShadow:
          "0 18px 36px -12px rgba(0,0,0,0.45), 0 8px 16px -8px rgba(0,0,0,0.3)",
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider">
        <button
          onPointerDown={(e) => onDragStart?.(note.id, e)}
          className="inline-flex cursor-grab items-center gap-1 rounded p-1 opacity-60 hover:bg-[var(--ink)]/10 hover:opacity-100 active:cursor-grabbing"
          aria-label="Drag note"
          title="Drag to reposition"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        {onEdit && (
          <button
            onClick={() => onEdit(note.id)}
            className="inline-flex items-center gap-1 rounded p-1 opacity-60 hover:bg-[var(--ink)]/10 hover:opacity-100"
            aria-label="Edit note"
            title="Edit note"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <button
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 opacity-80 hover:bg-[var(--ink)]/10 hover:opacity-100"
              title="Move to another day"
            >
              <CalIcon className="h-3 w-3" /> {dateLabel}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={displayDate}
              onSelect={setDisplayDate}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--ink)]/10 px-2 py-0.5">
          <Clock className="h-3 w-3" /> {time}
        </span>
        <span className="rounded-full bg-[var(--ink)]/10 px-2 py-0.5">
          {note.shift}
        </span>
        {audioPath && (
          <button
            onClick={toggleAudio}
            disabled={audioLoading}
            className={
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 transition " +
              (audioPlaying
                ? "bg-[var(--ink)] text-white"
                : "bg-[var(--ink)]/10 hover:bg-[var(--ink)]/20")
            }
            title={audioPlaying ? "Pause voice note" : "Play voice note"}
            aria-label={audioPlaying ? "Pause voice note" : "Play voice note"}
          >
            {audioLoading ? (
              <Volume2 className="h-3 w-3 animate-pulse" />
            ) : audioPlaying ? (
              <Pause className="h-3 w-3" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            <span className="text-[10px] font-bold uppercase tracking-wider">Voice</span>
          </button>
        )}
        <button
          onClick={() => setStrikeMode((v) => !v)}
          className={
            "inline-flex items-center gap-1 rounded p-1 hover:bg-[var(--ink)]/10 " +
            (strikeMode ? "bg-[var(--ink)] text-white hover:bg-[var(--ink)]/85" : "opacity-60 hover:opacity-100")
          }
          aria-pressed={strikeMode}
          title={strikeMode ? "Exit strike mode" : "Draw strike-through on items"}
        >
          <PenLine className="h-3.5 w-3.5" />
        </button>
        {strikes.length > 0 && (
          <button
            onClick={undoStrike}
            className="inline-flex items-center gap-1 rounded p-1 opacity-60 hover:bg-[var(--ink)]/10 hover:opacity-100"
            title="Undo last strike"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div
        ref={imgWrapRef}
        className="relative mb-3 overflow-hidden rounded-sm bg-white/30"
        style={strikeMode ? { touchAction: "none" } : undefined}
        onPointerDown={onStrikeDown}
        onPointerMove={onStrikeMove}
        onPointerUp={onStrikeUp}
        onPointerCancel={onStrikeUp}
      >
        <img
          src={note.image_url}
          alt={`Handwritten note by ${note.written_by}`}
          className="block w-full select-none"
          draggable={false}
          loading="lazy"
        />
        <svg
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          className={
            "pointer-events-none absolute inset-0 h-full w-full " +
            (strikeMode ? "cursor-crosshair" : "")
          }
        >
          {strikes.map((s, i) => (
            <line
              key={i}
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              stroke="#dc2626"
              strokeWidth={0.012}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ strokeWidth: 3 } as React.CSSProperties}
            />
          ))}
          {tempStrike && (
            <line
              x1={tempStrike.x1}
              y1={tempStrike.y1}
              x2={tempStrike.x2}
              y2={tempStrike.y2}
              stroke="#dc2626"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ strokeWidth: 3 } as React.CSSProperties}
            />
          )}
        </svg>
        {strikeMode && (
          <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-[var(--ink)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow">
            Strike mode — drag across an item
          </div>
        )}
      </div>

      <button
        onClick={toggleStatus}
        disabled={busy}
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-md bg-[var(--ink)] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[var(--ink)]/85 disabled:opacity-50"
      >
        {isResolved ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
        {busy
          ? isResolved ? "Reopening…" : "Resolving…"
          : isResolved ? "Mark Open" : "Mark Resolved"}
      </button>
      {onResizeStart && (
        <button
          onPointerDown={(e) => onResizeStart(note.id, e)}
          className="absolute bottom-1 right-1 inline-flex h-5 w-5 cursor-nwse-resize items-center justify-center rounded text-[var(--ink)]/60 hover:bg-[var(--ink)]/10 hover:text-[var(--ink)] touch-none"
          aria-label="Resize note"
          title="Drag to resize"
        >
          <CornerResizeIcon className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}