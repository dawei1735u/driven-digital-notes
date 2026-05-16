import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Link } from "@tanstack/react-router";
import { PenLine } from "lucide-react";

type Note = Tables<"notes">;


export function EditNoteDialog({
  note,
  open,
  onOpenChange,
  onSaved,
}: {
  note: Note | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: (patch: Partial<Note>) => void;
}) {
  const [writtenBy, setWrittenBy] = useState("");
  const [shift, setShift] = useState(SHIFTS[0]);
  const [apartment, setApartment] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [displayDate, setDisplayDate] = useState("");
  const [status, setStatus] = useState<"open" | "resolved">("open");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!note) return;
    setWrittenBy(note.written_by ?? "");
    setShift(note.shift ?? SHIFTS[0]);
    setApartment(note.apartment ?? "");
    setCategory(note.category ?? CATEGORIES[0]);
    setDisplayDate(note.display_date ?? "");
    setStatus((note.status as "open" | "resolved") ?? "open");
    setError(null);
  }, [note]);

  if (!note) return null;

  const onSave = async () => {
    setSaving(true);
    setError(null);
    const patch = {
      written_by: writtenBy.trim() || note.written_by,
      shift,
      apartment: apartment.trim() || null,
      category,
      display_date: displayDate || note.display_date,
      status,
    };
    const { error: updErr } = await supabase
      .from("notes")
      .update(patch)
      .eq("id", note.id);
    setSaving(false);
    if (updErr) {
      setError(updErr.message);
      return;
    }
    onSaved?.(patch);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit note</DialogTitle>
          <DialogDescription>
            Update the details. To fix the handwritten drawing, open the note
            on the iPad writer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Written by">
            <input
              value={writtenBy}
              onChange={(e) => setWrittenBy(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Shift">
              <select
                value={shift}
                onChange={(e) => setShift(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {SHIFTS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as "open" | "resolved")
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Apartment / unit">
              <input
                value={apartment}
                onChange={(e) => setApartment(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Display date">
              <input
                type="date"
                value={displayDate}
                onChange={(e) => setDisplayDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </Field>
          </div>
          <Field label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>

          {error && (
            <p className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-900">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Link
            to="/ipad"
            search={{ edit: note.id }}
            className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
            onClick={() => onOpenChange(false)}
          >
            <PenLine className="h-4 w-4" /> Redraw on iPad
          </Link>
          <div className="flex gap-2">
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="rounded-md bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--ink)]/85 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}