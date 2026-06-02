## Goal
Add a search box to the Monitor board that filters the visible notes by keyword, matching against each note's transcribed text and metadata.

## Scope
Frontend-only change in `src/routes/_authenticated/monitor.tsx`. No DB/schema changes — `notes.transcribed_text` already stores the text generated from each handwritten/voice note.

## UX
- New search input in the existing top toolbar (next to the date range / size controls), with a search icon and a clear (×) button.
- Placeholder: "Search notes…"
- Live filtering as the user types (case-insensitive, trimmed). Debounce not needed at current note volumes.
- Match against: `transcribed_text`, `written_by`, `category`, `apartment`, `shift`.
- Multi-word query = AND across whitespace-split terms (e.g. `kitchen leak` matches notes containing both words anywhere across the searched fields).
- The existing note count badge already shows `filtered / total`, so it will automatically reflect the search result count.
- When the search yields zero results, show a small "No notes match "<query>"" message on the empty board.

## Technical notes
- Add `const [search, setSearch] = useState("")`.
- Extend the existing `filtered = notes.filter(...)` block (around line 439) to also apply the keyword filter after the date-range checks. Helper:
  ```ts
  const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const haystack = [n.transcribed_text, n.written_by, n.category, n.apartment, n.shift]
    .filter(Boolean).join(" ").toLowerCase();
  if (terms.length && !terms.every(t => haystack.includes(t))) return false;
  ```
- Keep the `tileAll` / autoLayout behavior unchanged — it already operates on `filtered`, so tiling will lay out only the matching notes.
- Use existing design tokens for input styling (match the toolbar's current look); reuse `lucide-react`'s `Search` and `X` icons (Search is already imported in other files).

## Out of scope
- iPad capture page (`/ipad`) — it's an input surface, not a browsing surface. Can be added later if requested.
- Server-side full-text search / Postgres `tsvector` — not needed at current scale; client-side filter over the already-loaded notes is sufficient and instant.
- Highlighting matched terms inside note images (the note body is an image, not selectable text).