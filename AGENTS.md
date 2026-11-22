<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Game architecture
- Quarterly report presentation derives closed-quarter finances from the personal ledger and saved stat summaries in a read-only view helper; keep settlement and all report continuation/event callbacks in Game to prevent replay or accounting changes.
- Political activity requests validate against the latest synchronous career reference and a persisted revision; the pure gameplay layer owns free-use limits, saved repetition counts, projected gains, personal-ledger spending and turn reset so duplicate rendered requests cannot replay effects and UI rewards match actual gains.
- Keep the game as a single app screen at `/`, with reusable menu, creation and career views; these are game states rather than website sections.
- Store the single-device career in browser storage, accessed only after hydration or in event handlers; the initial foundation requires no accounts or external services.
- Keep career validation browser-safe so save gates and office locks are independently testable.
- Keep visual roles in global CSS; dashboard-attention derives alerts without save mutations and opens existing subviews.
- Media (TV, Radio, Newspaper, S) is one Politics category rendered by media-hub.tsx with the tab kept in nav history; More never lists S so there is a single entry point.
- Keep Politics categories as career-view substates, with existing gameplay actions in their own panels; category navigation never modifies the saved career.
- Campaign UI delegates to the pure campaign module, and advanceTurn processes campaign progression once for the same calendar period; campaign and personal ledgers remain distinct.
- Campaign support gains share a pure dampening helper; polls and new vote outcomes share score weighting, and rival actions use office prices with resource-gated trait priorities so competition cannot spend unavailable cash.
- Campaign accounting persists a campaign-scoped end-date watermark alongside finance updates, with legacy poll fallback; reject overlapping or non-quarterly periods before any effects so payroll and passive donations cannot replay after reload or poll trimming.
- Opening campaign reserves use a cash-only ledger credit rather than the donation receiver; keep historical saved totals unchanged because trimmed ledgers cannot reliably reconstruct past fundraising.
- Newspaper editions are immutable turn snapshots produced by the pure campaign module; optional story imagery and a saved pending-paper flag preserve old careers and resume interrupted turn sequences without regeneration.
- Contextual events save their candidate, post-newspaper presentation and resolved history in the pure gameplay layer; continuation never processes time again.
- Office payroll uses a browser-safe pure module called by the existing monthly turn loop; persist an independent payment marker and uncapped pay history/personal ledger to prevent duplicate pay and preserve full-term records without touching campaign funds.
- Governing uses one browser-safe support engine for legislation, budgets, appointments and public decisions; persisted bills require chamber votes and executive approval before enactment.
- Public projects use pure modules and jurisdiction arrays; reserve across years, stage payments after treasury before expiry with end locks, consume escrow once, cancel unspent reservations. Completion markers gate category indicators, bounded approval and existing news/report effects — prevents replay/overdraft.
- State government uses a browser-safe tenure-scoped module for coalitions, committees, appointments, agencies and disasters; executive review delegates to persisted bill stages, and public allocations reserve commitments so budgets cannot erase funded programs.
- Federal business uses the shared support engine with explicit House/Senate votes on identical text; nominations require Senate review and executive directives use a closed lawful-authority catalogue within adopted appropriations.
- Office events reuse saved reports/papers/events, reserve public allocations, and persist evidence separately from allegations to prevent rerolls or unsupported guilt.
- Scandal records use scandal-schema.ts with a separate public phase and independent finding; scandals.ts unifies existing office/campaign/media paths and saves transition coverage before newspaper publication, without duplicating penalties or introducing trials.
- Term lifecycle uses a browser-safe module; retain tenure snapshots and a permanent printed-headline index independently of the capped newspaper archive so term limits and deduplication survive reloads.
- Pure crisis modules lock lifecycle/payments before projects/elections/expiry; outcomes gate loyalty/polls. CrisisPanel confirms live funds/authority. Crisis news persists event markers with transitions, then uses existing immutable paper/report flow; legacy history is not re-announced.
- Read src/lib/game/AGENTS.md before changing game rules.
- Governing docket changes use the schema-only save backfill and pure quarterly engine described in src/lib/game/AGENTS.md; keep executive turn gating separate from legislative authority and never bypass existing bill votes or public accounting.
- Career & Business uses substates; pure workforce/quarterly engines share forecast math and settle company-only funds through existing turn hooks.
- Optional AI post drafting goes through one public server function (src/lib/ai-post.functions.ts) with zod-capped input; game rules never depend on it so the game stays playable offline.
- Prison actions stay in a pure prison-activities module with persisted quarterly uses and revision guards; outside operations use existing-circle identities, and conviction eligibility is shared by campaign discovery and launch to keep release and save behavior consistent.
- Pardon petitions live only in the prison dashboard; taxes live in the Bank Taxes tab; media invitations expire after one turn via expireInvitations in advanceTurn.
- Civilian justice uses Home/Career & Business substates; Game dispatches crime/pardon requests against the latest career and saved revision to prevent replay.
- The Android APK is built in GitHub Actions: `build:mobile` (MOBILE_BUILD=1) makes a static SPA in dist/client without nitro, and Capacitor wraps it; the android/ folder is generated in CI, never committed, so the web build stays the single source.
- Phase 7 legacy: the national archive is permanent and additive (merge by id, never delete), survival checks are deterministic once per quarter, and endgame continues via adult-heir torch handoff or a fresh career that inherits the archive; see src/lib/game/AGENTS.md.
- Story Mode: scenarios live in the pure src/lib/game/story-mode.ts registry with feature matrices gating background ticks; story careers use isolated save keys (STORY_SAVE_KEY) so sandbox saves and coin balances are never touched; see src/lib/game/AGENTS.md.
- Story engine (Phase 2): all narrative content is data in STORY_NARRATIVES (src/lib/game/story-engine.ts); the engine ticks once per quarter after advanceTurn for story careers only, queues one conditional event at a time, and guards replays via completedEvents + queuedEvent; see src/lib/game/AGENTS.md.
- Story content (Phase 3): scenario endings are data (first matching condition wins, last is the unconditional fallback) and choices may declare career effects (approval/reputation/momentum) applied once by story-effects.ts through existing systems — story-engine.ts stays cycle-free and never imports approval/campaign modules.
- Scenario studio: AI drafts (src/lib/story-draft.functions.ts) are proposals only; approved edits live in device storage via story-overrides.ts and replace wording (dialogue, choice labels/previews) at display time, never effects, triggers or ids, so the engine and saves stay untouched.
- Localization: src/lib/game/i18n.ts holds en/es/fr dictionaries and a hydration-safe locale store (server renders English); the first-launch picker shows only after hydration when no locale is saved, and translations never touch career saves.
- Saves/wallet use signed envelopes (save-integrity.ts); release APK pins its signing cert in MainActivity — blocks edited saves and re-signed APKs.
