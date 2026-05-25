import { createFileRoute, Link, ClientOnly, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { HandwritingCanvas, type HandwritingCanvasHandle } from "@/components/HandwritingCanvas";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft,
  Eraser,
  Save,
  CheckCircle2,
  LogOut,
  Pencil,
  Pen,
  Trash2,
  Plus,
  List,
  ListOrdered,
  RotateCcw,
  ClipboardPaste,
  Youtube,
  Type,
  PenLine,
  Mic,
  Camera,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { summarizeYouTube } from "@/lib/youtube.functions";
import { transcribeAudio } from "@/lib/voice.functions";
import { getMyWorkspaceId } from "@/lib/admin.functions";
import { fetchClipboardImage } from "@/lib/image-proxy.functions";
import { VoiceRecorder, blobToBase64, type Recording } from "@/components/VoiceRecorder";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ipad")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    edit: typeof s.edit === "string" ? s.edit : undefined,
    mode:
      s.mode === "type" || s.mode === "voice" || s.mode === "handwrite"
        ? (s.mode as "type" | "voice" | "handwrite")
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Write a Task — Tasks" },
      {
        name: "description",
        content: "Write a handwritten task on iPad.",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
      },
    ],
  }),
  component: IpadPage,
});

const SHIFTS = ["Morning", "Afternoon", "Evening", "Overnight"];
const CATEGORIES = ["Package", "Maintenance", "Visitor", "Security", "Resident Request", "Other"];

/** Render typed text to a sticky-note PNG matching the handwriting canvas style. */
async function renderTypedNoteToBlob(text: string): Promise<Blob | null> {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = 1000;
  const fontPx = 28 * dpr;
  const lineHeight = Math.round(fontPx * 1.4);
  const marginX = 36 * dpr;
  const marginY = 36 * dpr;
  const w = Math.floor(cssW * dpr);

  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = `500 ${fontPx}px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;
  const maxWidth = w - marginX * 2;
  const lines: string[] = [];
  for (const para of text.replace(/\r\n/g, "\n").split("\n")) {
    if (!para.trim()) {
      lines.push("");
      continue;
    }
    const words = para.split(/\s+/);
    let current = "";
    for (const word of words) {
      const next = current ? current + " " + word : word;
      if (measure.measureText(next).width <= maxWidth) {
        current = next;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  const minH = Math.floor((cssW * 3) / 3.5) * dpr;
  const contentH = marginY * 2 + lines.length * lineHeight;
  const h = Math.max(minH, contentH);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff2a8";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#1a1a1a";
  ctx.font = `500 ${fontPx}px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;
  ctx.textBaseline = "top";
  let y = marginY;
  for (const line of lines) {
    ctx.fillText(line, marginX, y);
    y += lineHeight;
  }
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

function IpadPage() {
  const canvasRef = useRef<HandwritingCanvasHandle>(null);
  const navigate = useNavigate();
  const { edit: editId, mode: initialMode } = useSearch({ from: "/_authenticated/ipad" });

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
  const [penColor, setPenColor] = useState<string>("#1a1a1a");
  const [pendingStamp, setPendingStamp] = useState<"bullet" | "number" | null>(null);
  const [mode, setMode] = useState<"handwrite" | "type" | "voice">(
    editId ? "handwrite" : (initialMode ?? "handwrite"),
  );
  const [typedText, setTypedText] = useState("");
  const [recording, setRecording] = useState<Recording | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const transcribeFn = useServerFn(transcribeAudio);
  const fetchWorkspace = useServerFn(getMyWorkspaceId);
  const fetchImageForPaste = useServerFn(fetchClipboardImage);
  const workspaceIdRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { workspaceId } = await fetchWorkspace();
        if (!cancelled) workspaceIdRef.current = workspaceId;
      } catch {
        // non-fatal; insert will fail RLS if truly broken
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchWorkspace]);
  const typedRef = useRef<HTMLTextAreaElement>(null);
  const noteWrapRef = useRef<HTMLDivElement>(null);

  // Auto-size the Type textarea so it always matches at least the sticky-note
  // aspect ratio (3.5:3) and grows to fit any longer content.
  useEffect(() => {
    if (mode !== "type") return;
    const el = typedRef.current;
    const wrap = noteWrapRef.current;
    if (!el || !wrap) return;
    const resize = () => {
      const width = wrap.getBoundingClientRect().width;
      const minH = Math.round((width * 3) / 3.5);
      el.style.height = "auto";
      el.style.height = Math.max(minH, el.scrollHeight) + "px";
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [mode, typedText]);

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

  // Try to extract an image URL from an HTML clipboard payload.
  const extractImageUrlFromHtml = (html: string): string | null => {
    try {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const img = doc.querySelector("img");
      const src = img?.getAttribute("src");
      return src && src.trim() ? src.trim() : null;
    } catch {
      return null;
    }
  };

  const looksLikeImageUrl = (s: string) => {
    const t = s.trim();
    if (/^data:image\//i.test(t)) return true;
    if (/^https?:\/\/\S+$/i.test(t)) return true;
    return false;
  };

  const blobToDataUrl = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Failed to read pasted image."));
      reader.readAsDataURL(blob);
    });

  // Fetch a remote/data URL and turn it into a same-origin object URL so the
  // canvas isn't tainted and toBlob() works on save.
  const fetchAsObjectUrl = useCallback(
    async (src: string): Promise<string> => {
      if (src.startsWith("blob:") || src.startsWith("data:")) {
        const r = await fetch(src);
        const b = await r.blob();
        return URL.createObjectURL(b);
      }
      try {
        const r = await fetch(src, { mode: "cors" });
        if (!r.ok) throw new Error(`Failed to fetch image (${r.status}).`);
        const b = await r.blob();
        if (!b.type.startsWith("image/")) throw new Error("Clipboard URL is not an image.");
        const dataUrl = await blobToDataUrl(b);
        const local = await fetch(dataUrl);
        return URL.createObjectURL(await local.blob());
      } catch {
        const { dataUrl } = await fetchImageForPaste({ data: { url: src } });
        const local = await fetch(dataUrl);
        return URL.createObjectURL(await local.blob());
      }
    },
    [fetchImageForPaste],
  );

  const ensureCanvasForPaste = useCallback(async () => {
    if (canvasRef.current) return canvasRef.current;
    setMode("handwrite");
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (canvasRef.current) return canvasRef.current;
    }
    throw new Error("Couldn't open the handwritten note canvas. Tap Handwrite, then paste again.");
  }, []);

  const pasteImageFromSrc = useCallback(
    async (src: string) => {
      const canvas = await ensureCanvasForPaste();
      const objUrl = await fetchAsObjectUrl(src);
      try {
        await canvas.pasteImage(objUrl);
      } finally {
        URL.revokeObjectURL(objUrl);
      }
    },
    [ensureCanvasForPaste, fetchAsObjectUrl],
  );

  // Handle Cmd/Ctrl+V (or iPad paste menu) anywhere on the page.
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      // Don't hijack text pasting into form inputs, but do accept copied images.
      const target = e.target as HTMLElement | null;
      const cd = e.clipboardData;
      const items = cd?.items;
      if (!cd || !items || items.length === 0) return;
      const directImageItem = Array.from(items).find((item) => item.type.startsWith("image/"));
      const html = cd.getData("text/html");
      const htmlImageSrc = html ? extractImageUrlFromHtml(html) : null;
      const text = cd.getData("text/plain");
      const pastedImageLike = Boolean(
        directImageItem || htmlImageSrc || (text && looksLikeImageUrl(text)),
      );
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) &&
        !pastedImageLike
      ) {
        return;
      }
      e.preventDefault();
      setPasteError(null);
      try {
        const canvas = await ensureCanvasForPaste();
        // 1. Direct image bytes on the clipboard
        if (directImageItem) {
          const file = directImageItem.getAsFile();
          if (file) {
            const url = URL.createObjectURL(file);
            await canvas.pasteImage(url);
            URL.revokeObjectURL(url);
            flashPasteOk();
            return;
          }
        }
        // 2. HTML payload (common when copying an image from a webpage)
        if (htmlImageSrc) {
          await pasteImageFromSrc(htmlImageSrc);
          flashPasteOk();
          return;
        }
        // 3. Plain text — could be an image URL, otherwise paste as text
        if (text && looksLikeImageUrl(text)) {
          await pasteImageFromSrc(text);
          flashPasteOk();
          return;
        }
        if (text && text.trim()) {
          canvas.pasteText(text);
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

  // Drag & drop image files onto the page.
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const onDrop = async (e: DragEvent) => {
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;
      const file = Array.from(files).find((f) => f.type.startsWith("image/"));
      if (!file) return;
      e.preventDefault();
      setPasteError(null);
      try {
        const canvas = await ensureCanvasForPaste();
        const url = URL.createObjectURL(file);
        await canvas.pasteImage(url);
        URL.revokeObjectURL(url);
        flashPasteOk();
      } catch (err) {
        console.error(err);
        setPasteError(err instanceof Error ? err.message : "Failed to add image.");
      }
    };
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  }, []);

  // Toolbar button: read clipboard via the async API (needed on iPad / touch
  // where there's no keyboard shortcut).
  const pasteFromClipboard = async () => {
    setPasteError(null);
    try {
      const canvas = await ensureCanvasForPaste();
      if (navigator.clipboard && "read" in navigator.clipboard) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imgType = item.types.find((t) => t.startsWith("image/"));
          if (imgType) {
            const blob = await item.getType(imgType);
            const url = URL.createObjectURL(blob);
            await canvas.pasteImage(url);
            URL.revokeObjectURL(url);
            flashPasteOk();
            return;
          }
          if (item.types.includes("text/html")) {
            const blob = await item.getType("text/html");
            const html = await blob.text();
            const src = extractImageUrlFromHtml(html);
            if (src) {
              await pasteImageFromSrc(src);
              flashPasteOk();
              return;
            }
          }
        }
      }
      const text = await navigator.clipboard.readText();
      if (text && looksLikeImageUrl(text)) {
        await pasteImageFromSrc(text);
        flashPasteOk();
        return;
      }
      if (text && text.trim()) {
        canvas.pasteText(text);
        flashPasteOk();
      } else {
        setPasteError("Clipboard is empty.");
      }
    } catch (err) {
      console.error(err);
      setPasteError(
        err instanceof Error && err.message.startsWith("Failed to fetch image")
          ? err.message +
              " The source site may block cross-origin downloads — try right-click → Copy Image instead of Copy Link."
          : "Couldn't read the clipboard. Try Cmd/Ctrl+V instead, or grant clipboard permission.",
      );
    }
  };

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [photoActive, setPhotoActive] = useState(false);
  const photoTimerRef = useRef<number | null>(null);
  const openCamera = () => {
    setPasteError(null);
    // Switch into Handwrite mode synchronously so the photo can be pasted into
    // the canvas. The hidden <input> is rendered alongside the toolbar in all
    // modes, so .click() still fires inside the same user gesture.
    if (mode !== "handwrite") setMode("handwrite");
    setPhotoActive(true);
    if (photoTimerRef.current) window.clearTimeout(photoTimerRef.current);
    const input = cameraInputRef.current;
    if (!input) {
      setPhotoActive(false);
      toast.error("Couldn't open the camera", {
        description: "The camera control isn't ready yet. Try again.",
        action: { label: "Retry", onClick: () => openCamera() },
      });
      return;
    }
    try {
      input.click();
    } catch (err) {
      setPhotoActive(false);
      toast.error("Couldn't open the camera", {
        description: err instanceof Error ? err.message : "Your browser blocked the camera picker.",
        action: { label: "Retry", onClick: () => openCamera() },
      });
      return;
    }
    // If the picker never opens (permission denied, blocked by browser, no
    // camera) the input fires neither change nor cancel reliably on iOS. After
    // a short wait with no file selected, surface a retry toast.
    photoTimerRef.current = window.setTimeout(() => {
      setPhotoActive(false);
      toast.error("Camera didn't open", {
        description: "Allow camera access in your browser settings, then try again.",
        action: { label: "Retry", onClick: () => openCamera() },
        duration: 8000,
      });
    }, 8000);
  };
  const onCameraFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (photoTimerRef.current) {
      window.clearTimeout(photoTimerRef.current);
      photoTimerRef.current = null;
    }
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    setPhotoActive(false);
    if (!file || !canvasRef.current) return;
    setPasteError(null);
    try {
      const url = URL.createObjectURL(file);
      await canvasRef.current.pasteImage(url);
      URL.revokeObjectURL(url);
      flashPasteOk();
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Failed to add photo.";
      setPasteError(msg);
      toast.error("Couldn't add the photo", {
        description: msg,
        action: { label: "Retry", onClick: () => openCamera() },
      });
    }
  };

  const isEdit = !!editId;

  const selectTool = (t: "pen" | "eraser") => {
    setTool(t);
    canvasRef.current?.setTool(t);
  };

  const PEN_COLORS: { name: string; value: string }[] = [
    { name: "Black", value: "#1a1a1a" },
    { name: "Red", value: "#dc2626" },
    { name: "Blue", value: "#2563eb" },
    { name: "Green", value: "#16a34a" },
    { name: "Orange", value: "#ea580c" },
    { name: "Purple", value: "#7c3aed" },
    { name: "Highlighter Yellow", value: "#facc15" },
    { name: "Pink", value: "#ec4899" },
  ];

  const selectColor = (c: string) => {
    setPenColor(c);
    canvasRef.current?.setColor(c);
    // Switch back to pen when picking a color
    if (tool !== "pen") {
      setTool("pen");
      canvasRef.current?.setTool("pen");
    }
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
    if (mode === "handwrite" && canvasRef.current?.isEmpty()) {
      setError("Please write something on the note first.");
      return;
    }
    if (mode === "type" && !typedText.trim()) {
      setError("Please type something on the note first.");
      return;
    }
    if (mode === "voice" && !recording) {
      setError("Please record a voice note first.");
      return;
    }
    const author = writtenBy.trim() || "Owner";

    setSaving(true);
    try {
      // Voice mode: transcribe → render transcript image → upload audio
      let transcript: string | null = null;
      let audioPath: string | null = null;
      let blob: Blob | null = null;

      if (mode === "voice" && recording) {
        setTranscribing(true);
        const audioBase64 = await blobToBase64(recording.blob);
        const result = await transcribeFn({
          data: { audioBase64, mimeType: recording.mimeType },
        });
        setTranscribing(false);
        if (result.error) throw new Error(result.error);
        transcript = result.text.trim() || "(voice note — no speech detected)";

        // Upload audio clip
        const ext = recording.mimeType.includes("mp4")
          ? "m4a"
          : recording.mimeType.includes("wav")
            ? "wav"
            : "webm";
        const aTs = Date.now();
        const aRand = Math.random().toString(36).slice(2, 10);
        const wsFolder = workspaceIdRef.current ?? "shared";
        audioPath = `${wsFolder}/${aTs}-${aRand}.${ext}`;
        const { error: aUpErr } = await supabase.storage
          .from("note-audio")
          .upload(audioPath, recording.blob, {
            contentType: recording.mimeType,
            cacheControl: "3600",
            upsert: false,
          });
        if (aUpErr) throw aUpErr;

        blob = await renderTypedNoteToBlob(transcript);
      } else {
        blob =
          mode === "handwrite"
            ? await canvasRef.current!.toBlob()
            : await renderTypedNoteToBlob(typedText);
      }
      if (!blob) throw new Error("Could not export the note.");

      const ts = Date.now();
      const rand = Math.random().toString(36).slice(2, 10);
      const wsFolderImg = workspaceIdRef.current ?? "shared";
      const path = `${wsFolderImg}/${ts}-${rand}.png`;

      const { error: upErr } = await supabase.storage.from("note-images").upload(path, blob, {
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
            ...(audioPath ? { audio_url: audioPath, transcribed_text: transcript } : {}),
          })
          .eq("id", editId);
        if (updErr) throw updErr;
        setSavedAt(Date.now());
        setTimeout(() => {
          setSavedAt(null);
          navigate({ to: "/monitor" });
        }, 1200);
      } else {
        const { error: insErr } = await supabase.from("notes").insert({
          written_by: author,
          shift,
          apartment: apartment.trim() || null,
          category,
          image_url: path,
          audio_url: audioPath,
          transcribed_text: transcript,
          workspace_id: workspaceIdRef.current,
        });
        if (insErr) throw insErr;
        canvasRef.current?.clear();
        setTypedText("");
        setRecording(null);
        setApartment("");
        setSavedAt(Date.now());
        setTimeout(() => setSavedAt(null), 2500);
      }
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Failed to save note.");
    } finally {
      setSaving(false);
      setTranscribing(false);
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
          <div className="mb-3 inline-flex rounded-xl border border-input bg-card p-1 shadow-sm">
            <button
              onClick={() => setMode("handwrite")}
              className={
                "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition " +
                (mode === "handwrite"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent")
              }
              aria-pressed={mode === "handwrite"}
            >
              <PenLine className="h-4 w-4" /> Handwrite
            </button>
            <button
              onClick={() => setMode("type")}
              className={
                "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition " +
                (mode === "type"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent")
              }
              aria-pressed={mode === "type"}
            >
              <Type className="h-4 w-4" /> Type
            </button>
            <button
              onClick={() => setMode("voice")}
              className={
                "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition " +
                (mode === "voice"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent")
              }
              aria-pressed={mode === "voice"}
            >
              <Mic className="h-4 w-4" /> Voice
            </button>
            <button
              onClick={openCamera}
              className={
                "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition active:scale-95 " +
                (photoActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent")
              }
              aria-pressed={photoActive}
              title="Take a photo and add it to the note"
            >
              <Camera className="h-4 w-4" /> {photoActive ? "Opening camera…" : "Photo"}
            </button>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onCameraFile}
              className="hidden"
              aria-hidden="true"
            />
          </div>
          <div>
            <div
              ref={noteWrapRef}
              style={{
                maxHeight: "70vh",
                overflowY: "auto",
                WebkitOverflowScrolling: "touch",
                borderRadius: "6px",
                position: "relative",
              }}
            >
              {mode === "handwrite" ? (
                <>
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
                </>
              ) : mode === "type" ? (
                <textarea
                  ref={typedRef}
                  value={typedText}
                  onChange={(e) => setTypedText(e.target.value)}
                  placeholder="Type your note here…"
                  className="block w-full resize-none overflow-hidden rounded-md p-6 text-lg leading-relaxed text-foreground outline-none placeholder:text-foreground/40"
                  style={{
                    background: "var(--sticky-yellow)",
                    boxShadow:
                      "0 14px 28px -10px rgba(0,0,0,0.25), 0 6px 12px -6px rgba(0,0,0,0.18)",
                    fontFamily:
                      '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
                  }}
                />
              ) : (
                <div
                  className="flex flex-col items-center justify-center gap-6 rounded-md p-8 text-center"
                  style={{
                    aspectRatio: "3.5 / 3",
                    background: "var(--sticky-yellow)",
                    boxShadow:
                      "0 14px 28px -10px rgba(0,0,0,0.25), 0 6px 12px -6px rgba(0,0,0,0.18)",
                  }}
                >
                  <div className="flex flex-col items-center gap-2 text-foreground">
                    <Mic className="h-12 w-12 opacity-70" />
                    <p className="text-lg font-semibold">
                      {recording ? "Voice note captured" : "Record a voice note"}
                    </p>
                    <p className="max-w-md text-sm text-foreground/70">
                      Tap Record, speak your task, then Stop. Saving will transcribe it
                      automatically and post it to the board with audio playback.
                    </p>
                  </div>
                  <VoiceRecorder
                    recording={recording}
                    onChange={setRecording}
                    disabled={saving || transcribing}
                  />
                </div>
              )}
            </div>
            {pendingStamp && (
              <div className="mt-2 flex items-center justify-between rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-foreground">
                <span>
                  {pendingStamp === "bullet" ? "Bullet" : "Number"} mode armed — next tap places a
                  marker.
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
              <div
                className="inline-flex items-center gap-1.5 rounded-xl border border-input bg-card px-2 py-1.5 shadow-sm"
                role="group"
                aria-label="Pen color"
              >
                {PEN_COLORS.map((c) => {
                  const active = penColor === c.value && tool === "pen";
                  return (
                    <button
                      key={c.value}
                      onClick={() => selectColor(c.value)}
                      title={c.name}
                      aria-label={c.name}
                      aria-pressed={active}
                      className={
                        "h-8 w-8 rounded-full border-2 transition " +
                        (active
                          ? "border-foreground scale-110 shadow"
                          : "border-transparent hover:scale-105")
                      }
                      style={{ background: c.value }}
                    />
                  );
                })}
                <label
                  className="ml-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-input bg-background text-xs font-bold text-muted-foreground hover:bg-accent"
                  title="Custom color"
                >
                  +
                  <input
                    type="color"
                    value={penColor}
                    onChange={(e) => selectColor(e.target.value)}
                    className="sr-only"
                    aria-label="Custom pen color"
                  />
                </label>
              </div>
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
                {transcribing
                  ? "Transcribing…"
                  : saving
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
