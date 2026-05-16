import { createFileRoute, Link, ClientOnly, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  HandwritingCanvas,
  type HandwritingCanvasHandle,
} from "@/components/HandwritingCanvas";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Eraser, Save, CheckCircle2, LogOut, Pencil, Pen, Trash2, Plus, List, ListOrdered, RotateCcw, ClipboardPaste, Youtube, Type, PenLine } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { summarizeYouTube } from "@/lib/youtube.functions";

export const Route = createFileRoute("/_authenticated/ipad")({
  validateSearch: (s: Record<string, unknown>) => ({
    edit: typeof s.edit === "string" ? s.edit : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Write a Task — Tasks" },
      {
        name: "description",
        content: "Write a handwritten task on iPad.",
      },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" },
    ],
  }),
  component: IpadPage,
});

const SHIFTS = ["Morning", "Afternoon", "Evening", "Overnight"];
const CATEGORIES = [
  "Package",
  "Maintenance",
  "Visitor",
  "Security",
  "Resident Request",
  "Other",
];

function IpadPage() {
  const canvasRef = useRef<HandwritingCanvasHandle>(null);
  const navigate = useNavigate();
  const { edit: editId } = useSearch({ from: "/_authenticated/ipad" });

  const [writtenBy, setWrittenBy] = useState("");
  const [writtenByLocked, setWrittenByLocked] = useState(false);
  const [shift, setShift] = useState(SHIFTS[0]);
  const [apartment, setApartment] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [pendingStamp, setPendingStamp] = useState<"bullet" | "number" | null>(null);

  const armStamp = (type: "bullet" | "number") => {
    if (pendingStamp === type) {
      canvasRef.current?.cancelStamp();
      setPendingStamp(null);
    } else {
      canvasRef.current?.stampNext(type);
      setPendingStamp(type);
    }
  };

  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pasteOk, setPasteOk] = useState(false);
  const [ytLoading, setYtLoading] = useState(false);
  const [ytUrl, setYtUrl] = useState("");
  const summarizeYt = useServerFn(summarizeYouTube);

  const flashPasteOk = () => {
    setPasteOk(true);
    setTimeout(() => setPasteOk(false), 1500);
  };

  const insertYouTubeSummary = async () => {
    if (!canvasRef.current || ytLoading) return;
    const url = ytUrl.trim();
    if (!url) {
      setPasteError("Enter a YouTube URL first.");
      return;
    }
    setPasteError(null);
    setYtLoading(true);
    try {
      const res = await summarizeYt({ data: { url } });
      canvasRef.current.pasteText(res.text);
      setYtUrl("");
      flashPasteOk();
    } catch (err) {
      console.error(err);
      setPasteError(err instanceof Error ? err.message : "Failed to summarize video.");
    } finally {
      setYtLoading(false);
    }
  };

  // Handle Cmd/Ctrl+V (or iPad paste menu) anywhere on the page.
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      // Don't hijack pasting into form inputs.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (!canvasRef.current) return;
      const items = e.clipboardData?.items;
      if (!items || items.length === 0) return;
      e.preventDefault();
      setPasteError(null);
      try {
        for (const item of Array.from(items)) {
          if (item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (!file) continue;
            const url = URL.createObjectURL(file);
            await canvasRef.current.pasteImage(url);
            URL.revokeObjectURL(url);
            flashPasteOk();
            return;
          }
        }
        const text = e.clipboardData?.getData("text/plain");
        if (text && text.trim()) {
          canvasRef.current.pasteText(text);
          flashPasteOk();
        }
      } catch (err) {
        console.error(err);
        setPasteError(err instanceof Error ? err.message : "Failed to paste.");
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  // Toolbar button: read clipboard via the async API (needed on iPad / touch
  // where there's no keyboard shortcut).
  const pasteFromClipboard = async () => {
    if (!canvasRef.current) return;
    setPasteError(null);
    try {
      if (navigator.clipboard && "read" in navigator.clipboard) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imgType = item.types.find((t) => t.startsWith("image/"));
          if (imgType) {
            const blob = await item.getType(imgType);
            const url = URL.createObjectURL(blob);
            await canvasRef.current.pasteImage(url);
            URL.revokeObjectURL(url);
            flashPasteOk();
            return;
          }
        }
      }
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        canvasRef.current.pasteText(text);
        flashPasteOk();
      } else {
        setPasteError("Clipboard is empty.");
      }
    } catch (err) {
      console.error(err);
      setPasteError(
        "Couldn't read the clipboard. Try Cmd/Ctrl+V instead, or grant clipboard permission.",
      );
    }
  };

  const isEdit = !!editId;

  const selectTool = (t: "pen" | "eraser") => {
    setTool(t);
    canvasRef.current?.setTool(t);
  };

  // Auto-populate "Written by" from the signed-in doorman's approved-user record
  useEffect(() => {
    if (isEdit) return; // edit mode preserves the original author
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const email = userData.user?.email;
      if (!email) return;
      const { data } = await supabase
        .from("allowed_users")
        .select("display_name")
        .ilike("email", email)
        .maybeSingle();
      if (cancelled) return;
      const name = data?.display_name?.trim() || email.split("@")[0];
      setWrittenBy(name);
      setWrittenByLocked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit]);

  // Load existing note when in edit mode
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    (async () => {
      setLoadingEdit(true);
      setError(null);
      const { data, error: fetchErr } = await supabase
        .from("notes")
        .select("*")
        .eq("id", editId)
        .maybeSingle();
      if (cancelled) return;
      if (fetchErr || !data) {
        setError(fetchErr?.message ?? "Note not found.");
        setLoadingEdit(false);
        return;
      }
      setWrittenBy(data.written_by ?? "");
      setShift(data.shift ?? SHIFTS[0]);
      setApartment(data.apartment ?? "");
      setCategory(data.category ?? CATEGORIES[0]);
      // Resolve a signed URL for the existing image and load into canvas
      const path = data.image_url?.startsWith("http")
        ? (data.image_url.match(/\/note-images\/(.+?)(?:\?.*)?$/)?.[1] ?? null)
        : data.image_url;
      if (path) {
        const { data: signed } = await supabase.storage
          .from("note-images")
          .createSignedUrl(path, 3600);
        const url = signed?.signedUrl;
        if (url) {
          // Canvas is inside <ClientOnly> — wait briefly for the ref.
          for (let i = 0; i < 20 && !canvasRef.current; i++) {
            await new Promise((r) => setTimeout(r, 50));
            if (cancelled) return;
          }
          if (canvasRef.current) {
            try {
              await canvasRef.current.loadFromUrl(url);
            } catch (e) {
              console.error(e);
            }
          }
        }
      }
      setLoadingEdit(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [editId]);

  const reset = () => {
    canvasRef.current?.clear();
    setApartment("");
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const onSave = async () => {
    setError(null);
    if (canvasRef.current?.isEmpty()) {
      setError("Please write something on the note first.");
      return;
    }
    const author = writtenBy.trim() || "Owner";

    setSaving(true);
    try {
      const blob = await canvasRef.current!.toBlob();
      if (!blob) throw new Error("Could not export the drawing.");

      const ts = Date.now();
      const rand = Math.random().toString(36).slice(2, 10);
      const path = `${ts}-${rand}.png`;

      const { error: upErr } = await supabase.storage
        .from("note-images")
        .upload(path, blob, {
          contentType: "image/png",
          cacheControl: "3600",
          upsert: false,
        });
      if (upErr) throw upErr;

      if (isEdit && editId) {
        // Update existing note with new metadata + new image path
        const { error: updErr } = await supabase
          .from("notes")
          .update({
            written_by: author,
            shift,
            apartment: apartment.trim() || null,
            category,
            image_url: path,
          })
          .eq("id", editId);
        if (updErr) throw updErr;
        setSavedAt(Date.now());
        setTimeout(() => {
          setSavedAt(null);
          navigate({ to: "/monitor" });
        }, 1200);
      } else {
        // Bucket is private — store the storage path. Monitor signs URLs at view time.
        const { error: insErr } = await supabase.from("notes").insert({
          written_by: author,
          shift,
          apartment: apartment.trim() || null,
          category,
          image_url: path,
        });
        if (insErr) throw insErr;
        canvasRef.current?.clear();
        setApartment("");
        setSavedAt(Date.now());
        setTimeout(() => setSavedAt(null), 2500);
      }
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Failed to save note.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main
      className="min-h-screen bg-background text-foreground"
      style={{ touchAction: "manipulation" }}
    >
      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-6 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">
            Tasks ·{" "}
            {isEdit ? (
              <span className="inline-flex items-center gap-1">
                <Pencil className="h-5 w-5" /> Edit
              </span>
            ) : (
              "Write"
            )}
          </h1>
          <Link
            to="/monitor"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Tasks Board →
          </Link>
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>

        <div>
          <div>
            <div
              style={{
                maxHeight: "70vh",
                overflowY: "auto",
                WebkitOverflowScrolling: "touch",
                borderRadius: "6px",
                position: "relative",
              }}
            >
              <ClientOnly
                fallback={
                  <div
                    style={{
                      aspectRatio: "3.5 / 3",
                      width: "100%",
                      background: "var(--sticky-yellow)",
                      borderRadius: "6px",
                    }}
                  />
                }
              >
                <HandwritingCanvas ref={canvasRef} />
              </ClientOnly>
              {pendingStamp && (
                <div
                  className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 animate-pulse rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-lg"
                  role="status"
                  aria-live="polite"
                >
                  {pendingStamp === "bullet"
                    ? "• Tap the canvas to place a bullet"
                    : "# Tap the canvas to place the next number"}
                </div>
              )}
            </div>
            {pendingStamp && (
              <div className="mt-2 flex items-center justify-between rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-foreground">
                <span>
                  {pendingStamp === "bullet" ? "Bullet" : "Number"} mode armed — next tap places a marker.
                </span>
                <button
                  onClick={() => {
                    canvasRef.current?.cancelStamp();
                    setPendingStamp(null);
                  }}
                  className="ml-3 rounded-md border border-input bg-card px-3 py-1 text-xs font-semibold hover:bg-accent"
                >
                  Cancel
                </button>
              </div>
            )}
            <div
              className="mt-4 flex flex-wrap gap-3 [&_button]:select-none [&_button]:[touch-action:manipulation] [&_button]:[-webkit-touch-callout:none] [&_button]:[-webkit-user-select:none]"
              style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
              onContextMenu={(e) => e.preventDefault()}
            >
              <button
                onClick={() => selectTool("pen")}
                className={
                  "inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-base font-semibold shadow-sm " +
                  (tool === "pen"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-card hover:bg-accent")
                }
                aria-pressed={tool === "pen"}
              >
                <Pen className="h-5 w-5" /> Pen
              </button>
              <button
                onClick={() => selectTool("eraser")}
                className={
                  "inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-base font-semibold shadow-sm " +
                  (tool === "eraser"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-card hover:bg-accent")
                }
                aria-pressed={tool === "eraser"}
              >
                <Eraser className="h-5 w-5" /> Eraser
              </button>
              <button
                onClick={() => canvasRef.current?.clear()}
                className="inline-flex items-center gap-2 rounded-xl border border-input bg-card px-5 py-3 text-base font-semibold shadow-sm hover:bg-accent"
              >
                <Trash2 className="h-5 w-5" /> Clear all
              </button>
              <button
                onClick={() => canvasRef.current?.extend(300)}
                className="inline-flex items-center gap-2 rounded-xl border border-input bg-card px-5 py-3 text-base font-semibold shadow-sm hover:bg-accent"
              >
                <Plus className="h-5 w-5" /> Add space
              </button>
              <button
                onClick={() => armStamp("bullet")}
                className={
                  "inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-base font-semibold shadow-sm " +
                  (pendingStamp === "bullet"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-card hover:bg-accent")
                }
                aria-pressed={pendingStamp === "bullet"}
                title="Tap the canvas to drop a bullet"
              >
                <List className="h-5 w-5" /> Bullet
              </button>
              <button
                onClick={() => armStamp("number")}
                className={
                  "inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-base font-semibold shadow-sm " +
                  (pendingStamp === "number"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-card hover:bg-accent")
                }
                aria-pressed={pendingStamp === "number"}
                title="Tap the canvas to drop the next number"
              >
                <ListOrdered className="h-5 w-5" /> Number
              </button>
              <button
                onClick={() => canvasRef.current?.resetNumbering()}
                className="inline-flex items-center gap-2 rounded-xl border border-input bg-card px-5 py-3 text-base font-semibold shadow-sm hover:bg-accent"
                title="Restart numbering at 1"
              >
                <RotateCcw className="h-5 w-5" /> Reset #
              </button>
              <button
                onClick={pasteFromClipboard}
                className="inline-flex items-center gap-2 rounded-xl border border-input bg-card px-5 py-3 text-base font-semibold shadow-sm hover:bg-accent"
                title="Paste text or image from clipboard (or use Cmd/Ctrl+V)"
              >
                <ClipboardPaste className="h-5 w-5" /> Paste
              </button>
              <div className="inline-flex items-stretch gap-2 rounded-xl border border-input bg-card px-2 py-1 shadow-sm">
                <div className="inline-flex items-center gap-2 pl-1 text-muted-foreground">
                  <Youtube className="h-5 w-5" />
                </div>
                <input
                  type="url"
                  value={ytUrl}
                  onChange={(e) => setYtUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      insertYouTubeSummary();
                    }
                  }}
                  placeholder="Paste YouTube URL…"
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-56 bg-transparent text-base outline-none placeholder:text-muted-foreground select-text [-webkit-user-select:text] [-webkit-touch-callout:default]"
                  aria-label="YouTube URL"
                />
                <button
                  onClick={insertYouTubeSummary}
                  disabled={ytLoading || !ytUrl.trim()}
                  className="rounded-lg bg-[var(--ink)] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--ink)]/85 disabled:opacity-50"
                  title="Insert a quick summary of the YouTube video"
                >
                  {ytLoading ? "Summarizing…" : "Summarize"}
                </button>
              </div>
              <button
                onClick={onSave}
                disabled={saving}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--ink)] px-5 py-3 text-base font-bold text-white shadow-md transition hover:bg-[var(--ink)]/85 disabled:opacity-60"
              >
                <Save className="h-5 w-5" />
                {saving
                  ? "Saving…"
                  : isEdit
                  ? "Save Changes"
                  : "Save Note"}
              </button>
            </div>

            {savedAt && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-green-100 px-3 py-2 text-sm font-medium text-green-900">
                <CheckCircle2 className="h-4 w-4" />
                {isEdit ? "Changes saved." : "Saved to the board."}
              </div>
            )}
            {loadingEdit && (
              <div className="mt-3 rounded-md bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900">
                Loading existing note…
              </div>
            )}
            {pasteOk && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-blue-100 px-3 py-2 text-sm font-medium text-blue-900">
                <ClipboardPaste className="h-4 w-4" /> Pasted to the note.
              </div>
            )}
            {pasteError && (
              <div className="mt-3 rounded-md bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900">
                {pasteError}
              </div>
            )}
            {error && (
              <div className="mt-3 rounded-md bg-red-100 px-3 py-2 text-sm font-medium text-red-900">
                {error}
              </div>
            )}
          </div>
        </div>

      </div>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}