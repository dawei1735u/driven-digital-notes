import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  audioBase64: z.string().min(1).max(20_000_000),
  mimeType: z.string().min(3).max(64),
});

/** Transcribe a short audio recording using Lovable AI Gateway (Gemini). */
export const transcribeAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { text: "", error: "AI gateway is not configured." };
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
              "You transcribe short voice notes for a doorman task board. Return ONLY the spoken words as clean, punctuated plain text. No prefaces, no quotes, no commentary. If the audio is silent or unintelligible, return an empty string.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Transcribe this voice note verbatim." },
              {
                type: "input_audio",
                input_audio: {
                  data: data.audioBase64,
                  format: data.mimeType.includes("mp4") || data.mimeType.includes("m4a")
                    ? "mp4"
                    : data.mimeType.includes("wav")
                    ? "wav"
                    : "webm",
                },
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("transcribeAudio failed", res.status, errText);
      if (res.status === 429) {
        return { text: "", error: "Too many requests — please try again in a moment." };
      }
      if (res.status === 402) {
        return { text: "", error: "AI credits exhausted. Add credits in Workspace Usage." };
      }
      return { text: "", error: `Transcription failed (${res.status}).` };
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = (json.choices?.[0]?.message?.content ?? "").trim();
    return { text, error: null as string | null };
  });
