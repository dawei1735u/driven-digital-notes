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

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI is not configured.");

    const prompt = `Summarize the YouTube video below in 3–5 short bullet points (each on its own line, starting with "• "). Be concise and factual. If you don't know the video, use the title to infer the likely topic.

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
          { role: "system", content: "You write tight, factual video summaries." },
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

    const header = title
      ? `${title}${author ? ` — ${author}` : ""}\nhttps://youtu.be/${videoId}\n\n`
      : `https://youtu.be/${videoId}\n\n`;

    return { text: header + (summary || "(no summary returned)") };
  });
