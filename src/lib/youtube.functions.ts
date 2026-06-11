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
    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Fetch oEmbed for title/author (best effort).
    let title = "";
    let author = "";
    try {
      const oembedRes = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`,
      );
      if (oembedRes.ok) {
        const j = (await oembedRes.json()) as { title?: string; author_name?: string };
        title = j.title ?? "";
        author = j.author_name ?? "";
      }
    } catch {
      /* ignore */
    }

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI is not configured.");

    // Gemini natively ingests YouTube URLs as video input. This is far more
    // reliable than scraping caption tracks (which now require a PoToken and
    // typically return empty bodies for most videos).
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You write tight, factual video summaries grounded in the supplied video. Do not invent details.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Summarize this YouTube video in 4–6 short bullet points (each on its own line, starting with \"• \"). Be concise and factual.",
              },
              { type: "video_url", video_url: { url: canonicalUrl } },
            ],
          },
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
    if (!summary) throw new Error("No summary returned. Try a different video.");

    const header = title
      ? `${title}${author ? ` — ${author}` : ""}\nhttps://youtu.be/${videoId}\n\n`
      : `https://youtu.be/${videoId}\n\n`;

    return { text: header + summary };
  });
