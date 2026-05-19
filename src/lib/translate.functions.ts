import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  imageUrl: z.string().url().max(4000),
});

/** Transcribe a handwritten note image and translate it from Spanish to English. */
export const translateNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { original: "", translation: "", error: "AI gateway is not configured." };
    }

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
              "You read handwritten sticky notes (often in Spanish) for a doorman task board. Return STRICT JSON only, no prose, no code fences, with this exact shape: {\"original\": string, \"translation\": string}. \"original\" = verbatim transcription in the source language (preserve line breaks with \\n, keep lists as written). \"translation\" = clean, natural English translation. If text is unreadable, set both to empty strings.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Transcribe this handwritten note and translate it to English. Return JSON only." },
              { type: "image_url", image_url: { url: data.imageUrl } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("translateNote failed", res.status, errText);
      if (res.status === 429) {
        return { original: "", translation: "", error: "Too many requests — please try again in a moment." };
      }
      if (res.status === 402) {
        return { original: "", translation: "", error: "AI credits exhausted. Add credits in Workspace Usage." };
      }
      return { original: "", translation: "", error: `Translation failed (${res.status}).` };
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = (json.choices?.[0]?.message?.content ?? "").trim();
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    try {
      const parsed = JSON.parse(cleaned) as { original?: string; translation?: string };
      return {
        original: (parsed.original ?? "").trim(),
        translation: (parsed.translation ?? "").trim(),
        error: null as string | null,
      };
    } catch {
      return { original: "", translation: raw, error: null as string | null };
    }
  });
