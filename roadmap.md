# Roadmap
- [x] Normalize APK certificate output and add explicit verification errors with regression tests; do not upload failed verification.
- [x] Verify reuploaded signing files match the original key; add APK/web artifact links to the workflow summary.
- [x] Sweep app identity, version numbering, startup signature guard and download verification; nine tests and workflow validation passed.
- [x] Harden Android signing and APK verification without replacing the signing identity; four signing tests and YAML validation passed.
- [ ] Downloadable APK — signing setup succeeded per the user's run; awaiting a successful GitHub Actions rerun after verification repair (no Actions access here).
- [x] Add Netlify SPA routing and downloadable dist.zip web artifact to the Android workflow.
- [ ] Preserve partner portraits, restrict gender choices, and add saved dating preferences with verification.
- [x] Build post-turn moral encounters, character stages, save guards, and automated verification.
- [x] Redesign Sandbox quarterly report dashboard and verify mobile continuation.
- [x] Story Mode Phase 1: mode picker (Sandbox vs Story), isolated story save keys, per-scenario feature matrix (available/locked/hidden), Story Mode landing page with scenario cards, read-only coin wallet
- [x] Phase 7: permanent national archive and evidence-based legacy scoring
- [x] Phase 7: mortality, retirement and adult-heir endgame
- [x] Phase 7: History dashboard, persistence and verification
- [x] Business Phase 2: valuation, liquidation, AI advisor
- [ ] Write credit-saving prompt for Living Costs Phase 1
- [x] Interactive floor roll calls, bicameral progression to the President, legislative bloc fallout
- [x] Impeachment & public unrest for mayor/governor/president (Prompt 1)
- [x] Prompt 2: group endorsement gating, crowded primaries, independent ballot access
- [x] Phase 5.1: treasury rebalancing (recurring infrastructure/public safety upkeep, higher project and crisis costs)
- [x] Phase 5.2: Independent presidential structural resistance in the Electoral College
- [x] Phase 5.3: aggressive rivals (attack ads when you lead, opposition research on weak record, debate/town hall counters)
- [x] HeartBeat dating app: profile browsing, matching, chat and existing Circle & Family date integration

## Treasury Phase 1
- [x] Treasury dashboard, revenue sources, taxes, loans, annual projects, aid, annual report
- [x] Phase 2 citizen happiness
- [ ] Phase 3 (awaiting user go-ahead)
- [x] Story Mode Phase 2: chapter/act engine with turn ranges and objectives, animated post-turn story card modal (portraits, dialogue, choices, consequence previews), 0–100 variables + flags + relationship modifiers with delayed triggers, conditional one-time event queue, Story Decisions log under More
- [x] Story Mode Phase 3: "Enemy Across the Aisle" full scenario content — 4 acts / 8 chapters / 20 turns, Senator Vance + campaign manager, reporter and party chair cast with painted portraits, secret bistro → media leak → midterm clash → TV debate → wedding choice → campaign leak → election-night finale, 7 evaluated endings, Act IV choices apply real approval/reputation/campaign-momentum effects through existing systems

## Energy system migration
- [x] Tiered energy costs, diet baselines, coin recharges, low-energy alert, legacy backfill
- [x] Align political/prison tests; add src/test/energy.test.ts
- [x] Energy displays and video/podcast gates read turn energy only
- [x] Phone-size browser check (HUD chip, depletion, alert, recharge, turn reset)

## Coins & missions
- [x] Achievement bounties, biennial missions, vital coin decisions (bailout, crisis PR, favors)
- [ ] More coin decisions (recount, legal counsel, impeachment, debate) — awaiting go-ahead

## Manual cloud save
- [ ] Complete progress bundle, mobile recovery-key formatting, and Settings controls.
- [ ] Validate signed saves before replacement; test serialization, overwrite and failure safety.
- [ ] Run game tests and verify real cloud upload/restore on phone and desktop layouts.
- [ ] iOS IPA build: needs iOS Unity Game ID + Apple signing secrets
