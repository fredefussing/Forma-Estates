---
name: Dashboard i18n externalization
description: Durable safeguards for translating dashboard UI strings and running bulk string externalization safely
---

# Dashboard i18n externalization

**Rules:**
- Bulk/scripted string replacement must end with a segment-level sweep: JSX text between `>…<` / `}…{` plus quoted strings, using a lexicon of Danish words WITHOUT æøå. Line-based sweeps miss mixed lines (`{t(...)} — trailing Danish`), comments, and type-position strings.
- Parallel subagents editing disjoint regions of the same file can silently lose edits (write races). Re-scan the whole file after they finish and re-apply misses.
- Module-level consts store translation KEYS; call `i18n.t()` only at render time (otherwise language freezes at import).
- Logic values stay untranslated: state values compared with `===` (e.g. morphStyle "hård"/"blød"), the "SLET" confirm token, view ids, ROOM_NAME_SUGGESTIONS / TOUR_ROOM_PRIO (Danish substring matching), AGENT_PROMPT_CATEGORIES `item.title` (testids — display via `titleKey`), API prompt payloads.
- Shared Danish maps (BOLIG_ROOM_LABELS / BOLIG_STYLE_LABELS in shared/boligPrompts.ts) must not be edited (server/PDF use them); the dashboard has `roomLabelLocalized`/`styleLabelLocalized` resolvers that map stable keys → `dashboard.roomTypes.*` / `dashboard.styles.*` with the Danish map as fallback.
- Dates/numbers use the `localeTag()` helper (i18n.language → BCP47); never hardcode "da-DK".
- Keep code placeholder names identical to locale values ({{num}} vs {{n}} mismatch renders raw text); locale files must keep dashboard.* key parity across all 7 languages, with no duplicate JSON keys.
- Completion review treats client-side PDF output (`pdf.text(...)`) and billing date locales as visible dashboard UI — externalize those too.
