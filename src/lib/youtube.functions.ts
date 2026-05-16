import { createServerFn } from "@tanstack/react-start";

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
    if (u.hostname.endsWith("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const m = u.pathname.match(/^\/(?:embed|shorts|v)\/([^/?#]+)/);
      if (m) return m[1];
    }
  } catch {
    /* ignore */
  }
  return null;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

type CaptionTrack = { baseUrl: string; languageCode?: string; kind?: string };

async function fetchWatchHtml(videoId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function parsePlayerResponse(html: string): unknown | null {
  // ytInitialPlayerResponse = { ... };
  const m = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var |<\/script>)/s);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function pickCaptionTrack(player: any): CaptionTrack | null {
  const tracks: CaptionTrack[] =
    player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (!tracks.length) return null;
  // Prefer manual English, then any English, then any manual, then first
  const manualEn = tracks.find(
    (t) => t.languageCode?.startsWith("en") && t.kind !== "asr",
  );
  if (manualEn) return manualEn;
  const anyEn = tracks.find((t) => t.languageCode?.startsWith("en"));
  if (anyEn) return anyEn;
  const manual = tracks.find((t) => t.kind !== "asr");
  return manual ?? tracks[0];
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

async function fetchTranscript(track: CaptionTrack): Promise<string | null> {
  try {
    // Force English translation when the source isn't English; ask for plain XML.
    const url = new URL(track.baseUrl);
    if (!(track.languageCode ?? "").startsWith("en")) url.searchParams.set("tlang", "en");
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    });
    if (!res.ok) return null;
    const xml = await res.text();
    const lines: string[] = [];
    const re = /<text[^>]*>([\s\S]*?)<\/text>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      const t = decodeXmlEntities(m[1].replace(/<[^>]+>/g, "")).trim();
      if (t) lines.push(t);
    }
    const joined = lines.join(" ").replace(/\s+/g, " ").trim();
    return joined || null;
  } catch {
    return null;
  }
}

export const summarizeYouTube = createServerFn({ method: "POST" })
  .inputValidator((input: { url: string }) => {
    if (!input || typeof input.url !== "string" || input.url.length > 500) {
      throw new Error("Invalid URL");
    }
    return input;
  })
  .handler(async ({ data }) => {
    const videoId = extractYouTubeId(data.url);
    if (!videoId) throw new Error("Not a valid YouTube URL.");

    // Fetch oEmbed for title/author
    let title = "";
    let author = "";
    try {
      const oembedRes = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      );
      if (oembedRes.ok) {
        const j = (await oembedRes.json()) as { title?: string; author_name?: string };
        title = j.title ?? "";
        author = j.author_name ?? "";
      }
    } catch {
      /* ignore */
    }

    // Try to pull a transcript from the watch page's player response.
    let transcript: string | null = null;
    let transcriptSource: "manual" | "auto" | "translated" | null = null;
    const html = await fetchWatchHtml(videoId);
    if (html) {
      const player = parsePlayerResponse(html);
      const track = player ? pickCaptionTrack(player) : null;
      if (track) {
        transcript = await fetchTranscript(track);
        if (transcript) {
          transcriptSource = !(track.languageCode ?? "").startsWith("en")
            ? "translated"
            : track.kind === "asr"
              ? "auto"
              : "manual";
        }
      }
    }

    // Trim very long transcripts to keep prompt size reasonable (~25k chars).
    const MAX = 25_000;
    const transcriptForPrompt =
      transcript && transcript.length > MAX
        ? transcript.slice(0, MAX) + "\n…(transcript truncated)"
        : transcript;

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI is not configured.");

    const prompt = transcriptForPrompt
      ? `Summarize the YouTube video below in 4–6 short bullet points (each on its own line, starting with "• "). Base the summary STRICTLY on the transcript. Be concise and factual; do not invent details.

Title: ${title || "(unknown)"}
Channel: ${author || "(unknown)"}
URL: https://www.youtube.com/watch?v=${videoId}

Transcript:
"""
${transcriptForPrompt}
"""`
      : `Summarize the YouTube video below in 3–5 short bullet points (each on its own line, starting with "• "). No transcript is available, so infer the likely topic from the title/channel and clearly note this is a best-guess overview.

URL: https://www.youtube.com/watch?v=${videoId}
Title: ${title || "(unknown)"}
Channel: ${author || "(unknown)"}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You write tight, factual video summaries grounded in the supplied transcript." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (aiRes.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
    if (aiRes.status === 402) throw new Error("AI credits exhausted. Add credits to continue.");
    if (!aiRes.ok) {
      const text = await aiRes.text().catch(() => "");
      throw new Error(`AI request failed: ${aiRes.status} ${text.slice(0, 200)}`);
    }

    const json = (await aiRes.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const summary = json.choices?.[0]?.message?.content?.trim() ?? "";

    const sourceLabel =
      transcriptSource === "manual"
        ? "Summary based on transcript"
        : transcriptSource === "auto"
          ? "Summary based on auto-generated captions"
          : transcriptSource === "translated"
            ? "Summary based on translated captions"
            : "Summary based on title/channel (no transcript available)";

    const header = title
      ? `${title}${author ? ` — ${author}` : ""}\nhttps://youtu.be/${videoId}\n${sourceLabel}\n\n`
      : `https://youtu.be/${videoId}\n${sourceLabel}\n\n`;

    return { text: header + (summary || "(no summary returned)") };
  });
