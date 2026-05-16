import { createFileRoute, Link, ClientOnly, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  HandwritingCanvas,
  type HandwritingCanvasHandle,
} from "@/components/HandwritingCanvas";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Eraser, Save, CheckCircle2, LogOut, Pencil, Pen, Trash2, Plus, List, ListOrdered, RotateCcw } from "lucide-react";

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
      if (data?.display_name) {
        setWrittenBy(data.display_name);
        setWrittenByLocked(true);
      }
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
    if (!writtenBy.trim()) {
      setError("Please enter who wrote the note.");
      return;
    }
    if (canvasRef.current?.isEmpty()) {
      setError("Please write something on the note first.");
      return;
    }

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
            written_by: writtenBy.trim(),
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
          written_by: writtenBy.trim(),
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
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
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
                onClick={() => canvasRef.current?.stampNext("bullet")}
                className="inline-flex items-center gap-2 rounded-xl border border-input bg-card px-5 py-3 text-base font-semibold shadow-sm hover:bg-accent"
                title="Tap the canvas to drop a bullet"
              >
                <List className="h-5 w-5" /> Bullet
              </button>
              <button
                onClick={() => canvasRef.current?.stampNext("number")}
                className="inline-flex items-center gap-2 rounded-xl border border-input bg-card px-5 py-3 text-base font-semibold shadow-sm hover:bg-accent"
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