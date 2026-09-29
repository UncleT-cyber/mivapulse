# PHASE 8.1 ACCEPTANCE — Period Selection & Future Timetable Handling

Status: PASS — 40/40 browser checks, 203/203 regression tests, `npm run validate` exit 0.

## Scope accepted

| Area | Result | Evidence |
| --- | --- | --- |
| Period discovery | PASS | 13 calendar months found in the parsed lessons + one explicit `All available dates` option; nothing is pre-selected on arrival (`preselected=false`) |
| Period options derived | PASS | Every option carries its own counts, read from the data: e.g. `November 2024 163 lessons · 163 courses` … `November 2026 542 lessons · 540 courses`, `All available dates 4557 lessons · 559 courses` |
| Explicit choice enforced | PASS | `Continue to courses` with no period is refused with `Choose which period of this timetable you want to use.` and the step stays on Period — the app never silently defaults |
| Filtering (projection) | PASS | September 2026 → 464 lessons / 462 courses; November 2026 → 542 / 540; custom `1 Sep 2026 – 30 Sep 2026` → 464 / 462. The full dataset stays 4557 entries after every projection (`assert` on object identity and byte-identical source) |
| Course catalogue follows the period | PASS | `540 courses found` (Nov 2026) vs `462 courses found` (Sep 2026) vs `559` (all dates); a course with no lesson in the period is not offered; the screen states `Course list for November 2026 — 542 lessons in this period.` |
| Custom range validation | PASS | Missing / non-date / out-of-order / outside-bounds each refused with its own plain reason (browser: `The start date cannot be after the end date.`); the previously chosen period and its projection stay in place on refusal |
| Period switching without re-parse | PASS | Node: the same dataset object is reused (`state.dataset === uploadedDataset`), no second `upload/*` action; browser: switch Sep → Nov on the second upload, catalogue flips 462 → 540 |
| No stale lessons | PASS | Switching clears the generated timetable (`state.timetable === null`) and `0` `[data-week]` blocks remain in the DOM; regenerating yields only `2026-11` week blocks (browser) and only `2026-11` days (node) |
| Selection survives a period change | PASS | `['SUM 101', 'SUM 103']` picks are kept across the switch; a course that only exists in the old period is surfaced as unmatched instead of silently dropped |
| New workbook resets derived state | PASS | Node: after `upload/started` + `upload/succeeded` with a second workbook — `dataset`, `period`, `periodDataset`, `selected`, `timetable` and `calendar` (status back to `idle`) are all reset; `template` is deliberately preserved; period options are regenerated from the new file only (`January 2045`, `All available dates`) and no `2024`/`2044` value from the old workbook is rendered |
| Future-period notice | PASS | Informational only, never blocking: shown for `November 2026` and for `All available dates` (both end after the workbook's own month), **not** for `September 2026`, an earlier month, or a custom range inside it. Condition = chosen period end > end of the month named by the workbook's leading sheet (`September 2026 Live Lesson Time` → source month 2026-09). No clock, no filename inference, no hard-coded month/year |
| Confidence policy unchanged | PASS | Projection reuses the *same* entry objects, so `linkState` verdicts are identical before and after filtering (`verified / needs-verification / missing` asserted per entry); a verified URL is carried through, an ambiguous entry never gains one. Validate baseline unchanged: `total 4557 / verified 4396 / needs-verification 161 / missing 0`, reasons `title-mismatch 152, title-only-match 4, conflicting-candidates 5` |
| Calendar output follows the period | PASS | Node: for an August-only selection the `.ics` contains exactly 1 event, every `DTSTART` is in `2044-08`, and exactly 1 `URL:` line (the verified lesson). Browser (all dates): 51 Google links, one per lesson — Google rows are built from the generated timetable, i.e. from the projection |
| HTML preview follows the period | PASS | Browser: September preview renders only `data-week="2026-09-*"` (1 week block) and `Timetable for September 2026 — 464 lessons in this period.`; November preview renders only `2026-11-*` |
| Parser untouched | PASS | Parser still extracts every lesson of every sheet (4557 valid / 0 invalid, `npm run validate` exit 0); all filtering happens in `projectDataset` after parsing |
| Product boundary | PASS | Existing boundary scan over `src/` + `public/` still enforces: no month-year literals, no ISO dates, no workbook row/column numbers, no meet URLs, no AI/auth/DB claims, no storage APIs, no `fetch(` in `public/app.js`, no `.xlsx` literal in `sw.js`. Period logic is data-driven only |
| Browser hygiene | PASS | Zero console errors / uncaught exceptions across the whole run |

## Period discovery on the reference workbook

Months are derived from lesson dates; the counts below are what the UI renders (screenshot `phase8-12-period-selection`):

| Period | Lessons | Courses | Period | Lessons | Courses |
| --- | --- | --- | --- | --- | --- |
| November 2024 | 163 | 163 | March 2026 | 477 | 477 |
| March 2025 | 245 | 244 | May 2026 | 325 | 324 |
| September 2025 | 63 | 63 | June 2026 | 519 | 421 |
| October 2025 | 421 | 323 | September 2026 | 464 | 462 |
| November 2025 | 360 | 355 | November 2026 | 542 | 540 |
| December 2025 | 200 | 200 | All available dates | 4557 | 559 |
| January 2026 | 389 | 389 | | | |
| February 2026 | 389 | 389 | | | |

Bounds shown to the student: `18 Nov 2024 to 26 Nov 2026`. There is no lesson in October 2026, so no option is offered for it — options are never invented for empty months.

## Browser run

- Harness: `scripts/phase8-browser.mjs` (raw CDP over WebSocket, no npm deps; fresh headless Chrome profile per run; viewport screenshots plus full-page captures for the period screens).
- Result: `output/phase8_1-browser.json` — `passed 40`, `failed 0`, `durationMs 7589`, `generatedAt 2026-09-29T06:07:11.616Z`, `consoleErrors: []`.
- New checks in this phase (the Phase 8 checks still run unchanged): 6-step shell, period options derived + nothing pre-selected, real bounds in the lead, explicit-choice refusal, month counts, future notice on period **and** courses, catalogue per period (540), out-of-order range refusal, custom range projection (464/462), September-only preview, stale-timetable clearing on switch, catalogue flip after switch, regenerated November-only preview, mobile period screen at 390 px.
- Screenshots (`/tmp/tf-shots/`, 17 files, all verified image-by-image):

| File | Shows |
| --- | --- |
| `phase8-01-idle` … `phase8-11-mobile-preview` | the Phase 8 journey, now on the 6-step shell |
| `phase8-12-period-selection` | 13 months + `All available dates` with real counts, empty range fields, `No period selected yet` |
| `phase8-13-selected-period-course-selection` | `Course list for November 2026 — 542 lessons`, future notice, `540 courses found`, `Showing 60 of 540` |
| `phase8-14-selected-period-preview` | `Timetable for September 2026 — 464 lessons`, 2 lessons / 1 link ready / 1 need verification, `Week of 14 Sep 2026` only, **no** future notice |
| `phase8-15-future-period-notice` | November 2026 selected (✓, 542/540) with the informational notice and the `18 lesson links need verification` summary |
| `phase8-16-custom-range` | `09/01/2026 → 09/30/2026` filled, summary `1 Sep 2026 – 30 Sep 2026 · 464 lessons · 462 courses`, no notice (inside the workbook month) |
| `phase8-17-mobile-period-selection` | period screen at 390 px: stacked list, `scrollWidth=390` |

## Regression suite

- `npm test`: **203/203 pass, 0 fail** (Phase 8 baseline 187 + 16).
  - `test/period.test.js` (9 tests, new): derived options, inclusive month/custom boundaries, range validation (`missing` / `invalid` / `order` / `outside`), `"all"` returns the same array, no mutation of the full dataset, month/year agnosticism (2044 and 1999 fixtures), source month from workbook metadata, provisional-notice logic, ISO-date validity, undated entries.
  - `test/phase8_1.acceptance.test.js` (6 tests, new): upload → period → courses with a derived catalogue; period switching (reparse-free, stale-free, selection preserved, unmatched surfaced); second-workbook reset; confidence untouched; step/notice contract; real workbook (13 months, 4557 under `all`, 464/462 and 542/540 projections, source month 2026-09, notice rules, full flow with a switch).
  - `test/ui.screens.test.js` (+1 test, new): period screen renders no pre-selection, real bounds in the lead, derived month + `All available dates` with counts, refusal without a choice, projection-based summary.
  - Existing tests **updated, not weakened** (the spec changed the workflow): `test/phase8.acceptance.test.js` step list now `'upload, period, courses, design, preview, calendar'` and its flow crosses the period step with an explicit choice; `test/ui.e2e.test.js` asserts the period step after `upload/continue`; `test/ui.state.test.js` guards were re-pointed (the “no courses” notice is now asserted on the *courses* step after an explicit period, and the immutability action list gained `period/select` + `period/continue`); `test/ui.screens.test.js` upload copy is now `Choose your period`. No assertion was deleted.
- `npm run validate`: exit 0, reference workbook baseline all `true`, confidence `4557 / 4396 / 161 / 0`, reasons `152 / 4 / 5`, `september2026Entries 464` — identical to the Phase 8 record.

## Relationship to the Phase 8 record

- `output/PHASE8_ACCEPTANCE.md` and `output/phase8-browser.json` (23 checks, `durationMs 4737`, `2026-09-29T02:32:11.447Z`) are **unchanged** — the Phase 8 run happened before the period step existed. This phase writes `output/phase8_1-browser.json`.
- Because the harness was extended in place, re-running `node scripts/phase8-browser.mjs` now produces the Phase 8.1 result file, and the shared screenshot names (`phase8-01` … `phase8-11`) now hold images captured on the 6-step shell. The Phase 8 document was deliberately not edited; this note is the explanation.

## Known limitations

1. Period options cover only months that actually contain lessons (no option for October 2026, none for months outside the workbook). Empty months are not offered rather than being shown as zero-lesson choices.
2. “Future” is decided from workbook metadata (the leading month sheet), not from a MIVA release calendar or the system clock. If a workbook's sheet names carry no month, no provisional claim is ever made.
3. Date inputs are native `type="date"`: display format follows the browser locale (`mm/dd/yyyy` in the screenshots) and native date pickers are unstyled by the app.
4. Google Calendar links and the `.ics` export are proven for the projected period in node (event count, dates, URL lines); the browser run exports the **all dates** flow (51 events), so a month-scoped `.ics` download was not exercised end-to-end in the browser.
5. The harness runs Chrome/CDP only, and mobile coverage uses `Emulation.setDeviceMetricsOverride` (390×844) rather than a real device.

## Not tested

1. Other browsers (Firefox/WebKit) and the service-worker/offline path under period switching — the PWA cache layer is untouched by this phase.
2. Multi-sheet workbooks whose leading sheet names disagree about the month (only the provided reference workbook is available).
3. Screen-reader / keyboard-only pass over the new period controls (`aria-pressed` and `aria-live` are asserted structurally, not audited).
4. Very large custom ranges across the full 25-month span at browser level (validated in node with synthetic data).

Phase 9 (MivaPulse Study Lab integration) is **not** started.
