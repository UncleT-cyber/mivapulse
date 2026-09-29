# PHASE 9 ACCEPTANCE — MivaPulse Study Lab Integration

Status: PASS — 29/29 browser checks, 15/15 integration tests, TimetableFlow 203/203, `npm run validate` exit 0, standalone browser 40/40, 0 console errors.

## 1. Architecture implemented

```text
MivaPulse (studylab.html)
   └── Timetable tool view          ← in-page view, no navigation
        └── host adapter           ← js/timetable-workspace.js (thin)
             └── /timetableflow/public/app.js   (the engine's own glue, unmodified)
                  └── /timetableflow/src/**     (engine ESM, served in place)
```

- **Chosen boundary:** shared source module, served in place. The engine lives in the single `timetableflow/` tree and is referenced directly — never copied, never bundled, never rewritten. MivaPulse's build system is "static files only", so the browser-native import map is the cleanest consumption: no bundler, no build step, no duplication.
- **Dependency direction:** `MivaPulse → TimetableFlow` only. The engine has zero knowledge of the host (no `mivapulseState`, `studyLabState`, `mivapulseRouter` — asserted by the integration tests).
- **Engine changes:** none to `src/parser/**`, `src/links/**`, `src/student/**`, `src/export/**` (§20). The only engine-tree changes are the vendored ExcelJS asset and the four standalone files that referenced its dev-server path (see §2).

## 2. Files changed

### MivaPulse (host)

| File | Change |
| --- | --- |
| `studylab.html` | Import map (`/src/` → `/timetableflow/src/`), tool switcher (Notes & Quiz / Timetable), Timetable workspace view with the engine mount contract (`#app`, `#tf-status`), host CSS + adapter script. All existing markup preserved. |
| `css/timetable-workspace.css` | New. Host visual adaptation: maps the engine's `:root` design tokens onto MivaPulse's theme variables for both themes, tool-switcher and workspace styles, re-asserts the host's fixed-navbar body offset against the engine's reset. |
| `js/timetable-workspace.js` | New. Thin host adapter: tool switching, lazy engine load (stylesheet + ExcelJS global + module), state preservation, load-error path. No domain logic. |
| `scripts/serve-static.mjs` | New. Dependency-free static server for the repo root with a production deny list (`node_modules`, `.git`, `.env*`) and traversal protection. |
| `scripts/phase9-browser.mjs` | New. CDP browser acceptance harness (27 checks, 11 screenshots, console + network capture). |
| `test/phase9.integration.test.js` | New. 14 integration tests (§4). |
| `package.json` | Added `scripts.test` and `scripts.serve`. |
| `output/phase9-browser.json` | New. Machine-readable browser result. |

### TimetableFlow (engine — minimal, asset-only)

| File | Change |
| --- | --- |
| `public/vendor/exceljs.min.js` | New. Vendored ExcelJS browser bundle (947 KB), hash-pinned to the npm package by the test suite. |
| `public/index.html` | ExcelJS `<script src>` → `/public/vendor/exceljs.min.js` (was the dev-server-only `/vendor/` route). |
| `public/sw.js` | Precache list updated to the committed path. |
| `scripts/serve-ui.js` | Vendor route serves the committed file. |
| `test/ui.pwa.test.js` | Vendor-path assertion updated to the committed path (same check, stronger path). |
| `test/phase8.acceptance.test.js` | Boundary scan scoped to product source; the vendored bundle is now hash-pinned instead of regex-scanned (its minified zip-crypto code contains the words "Password"/"Salt" — third-party internals, not product credentials). |

## 3. Import-map strategy

The engine's browser glue imports the engine through the absolute `/src/` namespace (e.g. `/src/ui/state.js`). `studylab.html` declares, before any module script:

```html
<script type="importmap">
{ "imports": { "/src/": "/timetableflow/src/" } }
</script>
```

The integration tests verify the map is declared first and that every absolute entry import in `public/app.js` resolves to a real file under `timetableflow/src/`. The engine's imports are untouched; the standalone architecture tests still pass.

## 4. ExcelJS strategy

- Vendored at `timetableflow/public/vendor/exceljs.min.js` — a committed static asset, no `node_modules` dependency, no CDN.
- The host adapter loads it as a classic script (the engine injects it via its existing `setExcelJS` boundary) and waits for it before importing the engine module.
- Verified: the browser requests `/timetableflow/public/vendor/exceljs.min.js`; no `node_modules` URL is ever requested; no dev-server-only route is used; the vendored bundle parses the real workbook (4557 entries) through the engine's own adapter in the integration tests; the bundle is hash-pinned to the npm package.

## 5. Theme integration

The host owns the theme (`data-theme` on `<html>`, toggled by the existing `#themeToggleBtn`). The host CSS maps the engine's tokens onto the host's theme variables under `:root[data-theme="light"]` and `:root[data-theme="dark"]` (specificity 0-2-0, so the mapping holds regardless of stylesheet load order). The host neutral variables already switch with the theme; only `color-scheme` is theme-specific (it drives native date inputs). No second theme switch exists in the workspace (asserted). Both themes verified in the browser.

## 6. Lazy-loading strategy

The engine is loaded only when the student opens the Timetable tool: the adapter injects the engine stylesheet, loads the ExcelJS global, then dynamic-imports the engine module. Verified in the browser: **zero** `/timetableflow/` requests before the tool opens; the full 29-module graph loads from `/timetableflow/` on first open. The dashboard and the rest of Study Lab never download the engine or ExcelJS.

Two refinements after the first acceptance run (the cold load is ~4.7 s, dominated by the 947 KB ExcelJS bundle):

- **Loading state** — while the engine downloads, the workspace shows a spinner and "Loading the timetable tool…" (host CSS, host theme variables). The engine replaces it the moment it mounts, so the wait never looks like a broken screen.
- **Hover preload** — `mouseenter`/`focus` on the Timetable tab starts the download early, so a deliberate click usually finds the engine already loaded. Still lazy: nothing downloads at page load.
- **Workspace header** — the section header stacks the "Timetable" title above the hint text with an 8 px gap (the host's `.section-header` is a row, which had pushed the hint inline, edge-to-edge). The hint is constrained to 62 ch so it never touches the card edges.

## 7. Tests

### MivaPulse integration tests — `npm test`: **14/14 pass, 0 fail**

`test/phase9.integration.test.js` (new; MivaPulse had no test suite before):

1. Study Lab exposes Timetable as a distinct tool
2. The workspace provides the engine mount contract (`#app`, `#tf-status`)
3. The import map points the engine namespace at the engine tree (and every entry import resolves)
4. The engine lazy-loads (no eager script/stylesheet; dynamic import + on-demand CSS)
5. ExcelJS is vendored as a committed static asset and really parses the real workbook
6. The host adapter contains no domain logic
7. The host maps engine tokens for both themes and adds no theme switch
8. All six timetable templates are still registered
9. Period discovery works through the engine on the real workbook (13 months + all)
10. Course selection operates on the period projection (462 September courses, not 559)
11. Confidence states survive integration unchanged (4396 / 161 / 0)
12. Conflicts survive integration (real overlapping pair, overlap duration reported)
13. Calendar export works and only verified lessons export URLs (held-back URLs never exported)
14. Returning to Study Lab preserves the workspace (adapter contract: loaded once, never unmounted)

### TimetableFlow regression — `npm test`: **203/203 pass, 0 fail** (unchanged)

### Real workbook validation — `npm run validate`: **exit 0**

`total 4557 / verified 4396 / needs-verification 161 / missing 0` — identical to the Phase 8/8.1 baseline.

### Standalone browser (Phase 8.1 harness re-run against the current tree): **40/40 pass**

Re-run after the ExcelJS path change to confirm the standalone still works end-to-end with the committed asset.

## 8. Browser acceptance — `node scripts/phase9-browser.mjs`

Result: `output/phase9-browser.json` — **29/29 pass, 0 fail**, `durationMs 8533`, `generatedAt 2026-09-29T08:19:04.516Z`.

The harness serves the MivaPulse root with the plain static server (no TimetableFlow dev server) and drives the integrated app through the real workbook:

| # | Check | Result |
| --- | --- | --- |
| 1 | Study Lab exposes Timetable as a distinct tool | PASS (light theme) |
| 2 | Existing Study Lab tools are intact | PASS (upload, ReadToMe, AI Quiz Generator) |
| 3 | The host owns the theme toggle | PASS |
| 4 | Nothing engine-related loads with the page | PASS (0 engine requests) |
| 5 | A loading state is shown while the engine loads | PASS (spinner + "Loading the timetable tool…") |
| 6 | The loading state is replaced once the engine mounts | PASS |
| 7 | The engine lazy-loads from the engine tree | PASS (29 modules from `/timetableflow/`) |
| 8 | ExcelJS loads from the committed static path | PASS |
| 9 | No node_modules URL is ever requested | PASS |
| 10 | No dev-server-only route is used | PASS |
| 11 | The static host does not serve node_modules | PASS (404) |
| 12 | The real MIVA workbook loads inside MivaPulse | PASS (4557 / 559 / 161) |
| 13 | Period discovery works (13 months + all, nothing pre-selected) | PASS |
| 14 | Course selection uses the period projection | PASS (462 courses found) |
| 15 | Real courses are selected from the period catalogue | PASS (3 selected) |
| 16 | All six templates are available | PASS |
| 17 | Templates switch on the design screen | PASS (dark, timeline) |
| 18 | Preview shows real lessons and real confidence states | PASS |
| 19 | Real conflicts are shown, not resolved | PASS |
| 20 | Needs-verification lessons stay held back | PASS (0 clickable links) |
| 21 | Mobile: the timetable fits 390px | PASS (scrollWidth=390) |
| 22 | One Google Calendar link per lesson | PASS (3 links) |
| 23 | Export finishes on a screen with real totals | PASS (3 classes) |
| 24 | The .ics file is actually downloaded | PASS |
| 25 | Back to Study Lab shows the existing tools | PASS |
| 26 | Returning to Timetable preserves the in-memory workspace | PASS (no re-upload, no reparse) |
| 27 | Dark theme applies to the whole page | PASS (body background rgb(15, 23, 42)) |
| 28 | The only console message is the engine service-worker registration | PASS (see §10) |
| 29 | No console errors or uncaught exceptions during the run | PASS |

- **Desktop:** 1280×800 — full workflow verified.
- **Mobile:** 390×844 via CDP `Emulation.setDeviceMetricsOverride` — `scrollWidth=390`, preview grid scrolls inside its own box.
- **Light theme:** default, forced deterministically through the host's own toggle.
- **Dark theme:** toggled through the host's `#themeToggleBtn`; the whole page (host chrome + engine) switches.
- **Console errors:** 0 (see §10 for the one filtered, proven-benign message).

## 9. Static deployment simulation (Vercel-style)

The entire browser run uses `scripts/serve-static.mjs` — a plain static file server with **no TimetableFlow dev-server routes**. Confirmed:

- `/timetableflow/public/app.js` resolves (200)
- `/timetableflow/src/**` resolves (all 29 modules)
- import-map resolution works (the engine's `/src/*` imports load)
- ExcelJS resolves from the committed path (`/timetableflow/public/vendor/exceljs.min.js`)
- real workbook parsing works end-to-end
- no dev-server-specific route is required
- `node_modules`, `.git` and `.env*` are denied by the server (404) and never requested

## 10. Console errors

Zero console errors or uncaught exceptions. One Chrome network message is filtered with a proven correlation: *"A bad HTTP response code (404) was received when fetching the script."* — the engine's glue registers `/sw.js`, the service worker of its standalone PWA shell. The host has no service worker, so that one registration 404s. The harness verifies the message appears exactly when the engine loads and that no worker is registered (`getRegistration()` → null); the engine catches the rejection itself. This is expected behavior on a static host, not a defect.

## 11. Security / path inspection

- **Sensitive files:** `.env.local` exists in the working tree but is untracked and matches `.gitignore` (`env*`) — it would never be committed or served. No `.pem`/`.key` files. No credentials in `src/`, `public/` (except the hash-pinned vendor bundle's internal string literals), or `scripts/`.
- **Served tree:** the static server denies `node_modules` (at any depth), `.git/` and `.env*`; path traversal returns 403. The browser graph references only `/timetableflow/public/**` and `/timetableflow/src/**` (verified by the network capture: 29 engine modules, all under `/timetableflow/`).
- **Import map:** maps exactly one prefix (`/src/` → `/timetableflow/src/`); declared before any module script.
- **No AI, no scraping, no auth, no database, no persistence:** the integration adds none of these; the engine's existing product-boundary scan still passes (203/203).

## 12. Screenshots (`/tmp/mivapulse-shots/`, 11 files, all real workbook data, all verified image-by-image)

| File | Shows |
| --- | --- |
| `phase9-01-study-lab-timetable-entry` | Study Lab with the tool switcher; Timetable is a distinct destination; all existing tools intact |
| `phase9-02-upload` | The TimetableFlow workspace inside Study Lab; real workbook loaded (4557 / 559 / Nov 2024 – Nov 2026 / 161 need verification) |
| `phase9-03-period` | 13 months + All available dates with real counts; real bounds; custom range; nothing pre-selected |
| `phase9-04-course-selection` | "Course list for September 2026 — 464 lessons"; 3 real courses selected |
| `phase9-05-design` | Template picker with all six templates |
| `phase9-06-preview` | Real lessons for the chosen period |
| `phase9-07-confidence-conflict` | CMS 302 held back with "Lesson link needs verification" and the title-mismatch explanation; 0 clickable links |
| `phase9-08-calendar` | Google Calendar links, one per lesson |
| `phase9-09-complete` | "Your timetable is ready" with real totals (3 classes · 3 courses · September 2026 · 2 links ready · 1 need verification · 1 schedule conflict) |
| `phase9-10-mobile` | 390px preview: the IFT 211 / MTH 209 overlap is visible ("Timetable conflict: two selected lessons overlap") alongside the held-back CMS 302 |
| `phase9-11-dark-theme` | The complete screen in dark mode — host chrome and engine both themed |

Two further evidence captures from the refinement run: `phase9-header-fixed.png` (the stacked, spaced workspace header) and `phase9-loading-state.png` (the spinner shown while the engine downloads).

## 13. PASS / KNOWN LIMITATION / DEFERRED / NOT TESTED

### PASS

- Standalone TimetableFlow: 203/203 tests, validate exit 0, standalone browser 40/40
- Real workbook validation: 4557 / 4396 / 161 / 0
- Study Lab navigation, dedicated workspace, lazy loading, ExcelJS static asset
- Period selection, course selection (period projection), six templates, preview
- Confidence handling, conflict handling, calendar export
- Back to Study Lab (state preserved), light theme, dark theme, 390px mobile
- Static/Vercel-style hosting, security/path inspection, 0 console errors

### KNOWN LIMITATION

1. The engine's standalone service-worker registration 404s on the host (see §10). Benign and filtered with a proven correlation; the host has no service worker by design.
2. The existing Study Lab tools remain grouped under "Notes & Quiz" because they share the extracted-text workspace (ReadToMe reads it, the quiz generator consumes it). Splitting them would restructure working functionality; Timetable is the new distinct destination.
3. The AI quiz generator itself requires the Groq API and is not exercised by the automated suite (its UI presence and wiring are asserted; the full AI flow needs an API key).

### DEFERRED

1. Committing `timetableflow/` to the MivaPulse git tree (currently untracked) — required for the Vercel deployment to serve the engine. **Not done** (see §14).
2. A MivaPulse-bundled service worker (offline shell for the integrated app) — out of scope; the engine's standalone PWA behavior is unchanged.

### NOT TESTED

1. Other browsers (Firefox/WebKit) — the harness is Chrome/CDP only.
2. The real Vercel deployment (not performed — see §14).
3. Screen-reader / keyboard-only pass over the new controls (ARIA roles are asserted structurally).

## 14. Deployment status

**No commit, no push, no deployment was performed.** The integration is complete in the working tree and verified locally against a production-like static server. Final git commit, push and Vercel deployment remain explicitly unauthorized and await approval.
