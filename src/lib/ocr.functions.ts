import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function extractTextFromImage(
  imageBytes: ArrayBuffer,
  contentType: string,
): Promise<{ text: string; error: string | null }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return { text: "", error: "AI gateway is not configured." };

  // Convert to base64 data URL
  const bytes = new Uint8Array(imageBytes);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);
  const dataUrl = `data:${contentType || "image/png"};base64,${b64}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "You read handwritten or typed notes from a doorman task board and extract the text exactly as written. Return ONLY the text content as plain text in the SAME LANGUAGE that was written — never translate. Preserve apartment numbers, names, and item lists. No prefaces, no commentary, no markdown. If the image is blank or unreadable, return an empty string.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract all text from this note image." },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("OCR failed", res.status, errText);
    if (res.status === 429) return { text: "", error: "Rate limited — try again shortly." };
    if (res.status === 402) return { text: "", error: "AI credits exhausted." };
    return { text: "", error: `OCR failed (${res.status}).` };
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = (json.choices?.[0]?.message?.content ?? "").trim();
  return { text, error: null };
}

async function ocrOne(noteId: string): Promise<{ text: string; error: string | null }> {
  const { data: note, error: nErr } = await supabaseAdmin
    .from("notes")
    .select("id, image_url")
    .eq("id", noteId)
    .single();
  if (nErr || !note) return { text: "", error: nErr?.message ?? "Note not found." };

  const { data: file, error: dErr } = await supabaseAdmin.storage
    .from("note-images")
    .download(note.image_url);
  if (dErr || !file) return { text: "", error: dErr?.message ?? "Image not found." };

  const buf = await file.arrayBuffer();
  const result = await extractTextFromImage(buf, file.type || "image/png");
  if (result.error) return result;

  const { error: uErr } = await supabaseAdmin
    .from("notes")
    .update({ transcribed_text: result.text })
    .eq("id", noteId);
  if (uErr) return { text: result.text, error: uErr.message };

  return result;
}

/** OCR a single note image and store extracted text. Callable by any signed-in user. */
export const ocrNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ noteId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Verify the user can see this note (workspace-scoped) before OCR.
    const supabase = context.supabase as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { id: string } | null }> };
        };
      };
    };
    const { data: visible } = await supabase
      .from("notes")
      .select("id")
      .eq("id", data.noteId)
      .maybeSingle();
    if (!visible) return { text: "", error: "Note not accessible." };
    return ocrOne(data.noteId);
  });

/** Admin-only: backfill OCR text for every note with no transcribed_text yet. */
export const ocrBackfillAll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const supabase = context.supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: boolean | null }>;
    };
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Admin only.");

    const { data: rows, error } = await supabaseAdmin
      .from("notes")
      .select("id")
      .or("transcribed_text.is.null,transcribed_text.eq.")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    let ok = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const row of rows ?? []) {
      const r = await ocrOne(row.id);
      if (r.error) {
        failed++;
        if (errors.length < 5) errors.push(r.error);
        // Stop early on rate-limit / credits to avoid burning through.
        if (r.error.includes("Rate limited") || r.error.includes("credits exhausted")) break;
      } else {
        ok++;
      }
    }
    return { processed: (rows ?? []).length, ok, failed, errors };
  });
