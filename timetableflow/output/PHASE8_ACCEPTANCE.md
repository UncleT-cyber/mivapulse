# PHASE 8 ACCEPTANCE — Student Selection & Real-World Workflow Validation

Status: PASS — 23/23 browser checks, 187/187 regression tests, `npm run validate` exit 0.

## Scope accepted

| Area | Result | Evidence |
| --- | --- | --- |
| Real workbook ingestion | PASS | Upload screen reports derived facts: `4557 lessons · 559 courses · Nov 2024 ~ Nov 2026 · 161 lesson links need verification` (no hard-coded values; every number read from cells) |
| Invalid-file refusal | PASS | Unsupported file rejected with the honest copy `this doesn't appear to be a supported miva timetable.` and the retry affordance stays available |
| Course selection | PASS | 6 codes selected by search + click from the 559-course catalogue; selection survives back/forward navigation |
| Timetable projection | PASS | Preview counts `51 lessons · 7 courses · 31 days · 42 links ready · 9 need verification · 10 schedule conflicts` — matches node acceptance suite exactly |
| Verified-link handling | PASS | CSC 406 renders a real clickable `https://meet.google.com/evs-xxok-vzq` |
| Needs-verification handling | PASS | NSC 309 detail: 2 candidate URLs shown, **0** clickable links, explanatory note present; CMS 302 shows `title-mismatch` reason under the state badge |
| Conflict handling | PASS | 10 overlapping pairs reported (e.g. `IFT 211 13:30–15:00` vs `NSC 309 13:30–15:00`, 90 min overlap) with "decide which one you will attend" — never silently resolved |
| Calendar export | PASS | 51 Google links (one per lesson); `.ics` actually downloads (`timetableflow-2026-09-29.ics`); reminder choice is live interactive state |
| Completion totals | PASS | Export screen totals consistent with preview |
| Navigation / session | PASS | Back keeps selection, forward serves the same timetable, reload starts clean (nothing persisted — no storage, no history) |
| Mobile workflow | PASS | 390 px via CDP `Emulation.setDeviceMetricsOverride`: upload, loaded and preview screens all `scrollWidth=390`; preview grid scrolls inside its own box |
| No lesson loss | PASS | 51 projected lessons = 51 selected-catalogue lessons (identity matched against the normalised dataset) |
| Product boundary | PASS | No course codes / ISO dates / meet URLs / workbook literals / month-year strings / AI claims / auth-DB keywords in runtime source (comments stripped); network limited to same-origin service-worker cache fetch; no storage APIs |
| Browser hygiene | PASS | Zero console errors / uncaught exceptions for the whole run |

## Browser run

- Harness: `scripts/phase8-browser.mjs` (raw CDP over WebSocket, no npm deps; fresh headless Chrome profile per run).
- Result: `output/phase8-browser.json` — `passed 23`, `failed 0`, `durationMs 4737`, `generatedAt 2026-09-29T02:32:11.447Z`.
- Selection under test: `IFT 211, PAD 213, CSC 406, CSC 301/MIVA-DTS 301, CMS 302, NSC 309` + unmatched `IFT 999`.
- Confidence split under test: verified 42 / needs-verification 9 (5 `conflicting-candidates`, 4 `title-mismatch`) / missing 0.
- Screenshots (`/tmp/tf-shots/`): `phase8-01-idle`, `02-invalid-file`, `03-loaded` (4557 / 559 / Nov 2024 ~ Nov 2026), `04-courses`, `05-design`, `06-preview` (51 / 7 / 31 / 42 / 9 / 10), `07-calendar`, `08-complete`, `09-after-reload`, `10-mobile-loaded`, `11-mobile-preview` (390 px, conflicts visible).

## Regression suite

- `npm test`: **187/187 pass, 0 fail** (includes new `test/phase8.acceptance.test.js`, 11 tests: ingestion, no lesson loss, dates/times/ordering, selection edge cases, mixed-confidence UI, NSC 309 conflict case, calendar export determinism, completion totals, navigation guards, offline HTML parity, product boundary).
- `npm run validate`: exit 0, reference workbook baseline all `true`, confidence `total 4557 / verified 4396 / needs-verification 161 / missing 0`, reasons `title-mismatch 152, title-only-match 4, conflicting-candidates 5`.

## Honest limitations carried into Phase 9

1. Reload resets to the upload step — nothing is persisted by design (no localStorage/IndexedDB/history integration).
2. Students pick from the 559-course catalogue only; free-text entry does not exist, so unmatched courses are reachable programmatically (`IFT 999` in tests) and remain visible but unprojected.
3. The validate baseline and expected numbers are tied to this workbook artifact; a next-month workbook changes the dataset the PWA caches — regeneration is a Phase 9 handoff item.
4. Selection tolerance: case/whitespace, `MIVA-` prefix both ways, slash halves, spacing variants, duplicate spellings; `BUA203` (no space) stays unmatched.
