#!/usr/bin/env node
/**
 * Phase 8 / 8.1 — browser workflow acceptance (real Chrome, real workbook, real clicks).
 *
 *   node scripts/phase8-browser.mjs
 *
 * Drives the running UI at http://localhost:4173 through the whole student
 * journey in a headless Chrome over the DevTools protocol (no extra npm deps):
 *
 *   load -> invalid file (error state) -> upload the real workbook
 *   -> choose the period (months derived from the workbook, custom range,
 *      explicit choice only, future-period notice)
 *   -> search + select courses -> design + templates -> preview
 *   (verified vs needs-verification vs candidates) -> back/forward
 *   -> calendar (Google links, reminders) -> export -> completion
 *   -> reload behaviour -> second upload: project one month, see only that
 *      month's catalogue/timetable, then switch periods without re-parsing
 *   -> mobile viewport (390x844) including the period screen
 *
 * Every step is a PASS/FAIL check; screenshots land in /tmp/tf-shots and the
 * machine-readable result in output/phase8_1-browser.json (the Phase 8 record
 * produced before Phase 8.1 stays at output/phase8-browser.json, untouched).
 * Exit code 0 only when every check passes.
 */

import { spawn } from 'node:child_process';
import { mkdir, readdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP_URL = 'http://localhost:4173/';
const WORKBOOK = path.join(ROOT, 'reference', 'miva-master-timetable', 'Live Lesson Time Table - Students Copy.xlsx');
const SHOTS = '/tmp/tf-shots';
const PROFILE = '/tmp/tf-phase8-profile';
const PORT = 9455 + Math.floor(Math.random() * 40);

/** Realistic selection, searched and clicked exactly like a student would. */
const PICKS = ['IFT 211', 'PAD 213', 'CSC 406', 'CSC 301/MIVA-DTS 301', 'CMS 302', 'NSC 309'];

const checks = [];
const screenshots = [];
const consoleErrors = [];

function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Chrome + CDP -------------------------------------------------------------------

async function launchChrome() {
  await rm(PROFILE, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], { stdio: 'ignore' });

  const base = `http://127.0.0.1:${PORT}`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const version = await (await fetch(`${base}/json/version`)).json();
      if (version.webSocketDebuggerUrl) return { chrome, base };
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('Chrome DevTools endpoint never came up');
}

async function connect(base) {
  const target = await (await fetch(`${base}/json/new?${encodeURIComponent(APP_URL)}`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let seq = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(message.params.exceptionDetails?.exception?.description ?? 'uncaught exception');
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      consoleErrors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '));
    }
    if (message.method === 'Log.entryAdded' && message.params.entry?.level === 'error') {
      consoleErrors.push(message.params.entry.text);
    }
  };

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');
  await send('Log.enable');

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'evaluation failed');
    return result.result?.value;
  };

  const shot = async (name, { full = false } = {}) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full });
    const file = path.join(SHOTS, `phase8-${name}.png`);
    await writeFile(file, Buffer.from(data, 'base64'));
    screenshots.push({ name, file });
    return file;
  };

  return { ws, send, evaluate, shot };
}

async function waitFor(evaluate, predicate, label, timeout = 60000) {
  const started = Date.now();
  let lastValue = null;
  while (Date.now() - started < timeout) {
    lastValue = await evaluate(predicate);
    if (lastValue) return lastValue;
    await sleep(300);
  }
  throw new Error(`timed out waiting for: ${label} (last value: ${JSON.stringify(lastValue)})`);
}

/** Normalized, lowercased page text: textContent with "51classes" -> "51 classes". */
function textExpr(rootExpr, needle = null) {
  const body = `const root = ${rootExpr}; const t = (root?.innerText || "").replace(/\\s+/g, " ").replace(/(\\d)(?=[A-Za-z])/g, "$1 ").trim().toLowerCase();`;
  if (!needle) return `(() => { ${body} return t; })()`;
  return `(() => { ${body} return t.includes(${JSON.stringify(needle)}) ? t : ""; })()`;
}
/** The stats row of the preview screen, normalized. */
const statsText = (evaluate) => evaluate(`(() => {
  const el = document.querySelector(".tf-stats");
  return el ? (el.innerText || "").replace(/\\s+/g, " ").trim().toLowerCase() : "";
})()`);
const pageText = (evaluate) => evaluate(textExpr('document.getElementById("app")'));
const footerText = (evaluate) => evaluate(textExpr('document.querySelector(".tf-footer")'));
const waitForText = (evaluate, needle, label, timeout = 60000) =>
  waitFor(evaluate, textExpr('document.getElementById("app")', needle), label, timeout);
const waitForAnyText = (evaluate, needles, label, timeout = 60000) =>
  waitFor(evaluate, needles.map((needle) => textExpr('document.getElementById("app")', needle)).join(' || '), label, timeout);
const currentStep = (evaluate) => evaluate('document.querySelector(".tf-step--current")?.textContent ?? ""');
/** The chosen-period summary block, normalized (label + counts). */
const summaryText = (evaluate) => evaluate(`(() => {
  const el = document.querySelector(".tf-period-summary");
  return el ? (el.innerText || "").replace(/\\s+/g, " ").trim().toLowerCase() : "";
})()`);
const click = (evaluate, selector) => evaluate(`(document.querySelector(${JSON.stringify(selector)})?.click(), true)`);
/** Fill a native date input the way a student types into it. */
const setDate = (evaluate, selector, value) => evaluate(`(() => {
  const input = document.querySelector(${JSON.stringify(selector)});
  if (!input) return false;
  input.value = ${JSON.stringify(value)};
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
})()`);
/** Normalized lesson block: {links, reason, text} — text is lowercased and spaced. */
const block = (evaluate, selector) => evaluate(`(() => {
  const b = document.querySelector(${JSON.stringify(selector)});
  if (!b) return null;
  const t = (b.innerText || "").replace(/\\s+/g, " ").replace(/(\\d)(?=[A-Za-z])/g, "$1 ").trim().toLowerCase();
  return { links: b.querySelectorAll("a[href]").length, reason: b.querySelector("[data-reason]")?.dataset.reason ?? "", text: t };
})()`);
const upload = (evaluate, send, file) => async (absolutePath) => {
  const document = await send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await send('DOM.querySelector', { nodeId: document.root.nodeId, selector: file });
  await send('DOM.setFileInputFiles', { files: [absolutePath], nodeId });
};

// --- the run -----------------------------------------------------------------------

async function main() {
  await mkdir(SHOTS, { recursive: true });
  await mkdir(path.join(SHOTS, 'downloads'), { recursive: true });
  await mkdir(path.join(ROOT, 'output'), { recursive: true });

  const { chrome, base } = await launchChrome();
  const { ws, send, evaluate, shot } = await connect(base);
  const setFile = upload(evaluate, send, '#tf-file');
  const started = Date.now();

  try {
    await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: path.join(SHOTS, 'downloads') }).catch(() => {});
    await waitFor(evaluate, 'document.readyState === "complete" && !!document.getElementById("tf-file")', 'the app shell');

    // 1. shell
    const steps = await evaluate('document.querySelectorAll(".tf-step").length');
    const excelReady = await evaluate('typeof ExcelJS !== "undefined" && !!globalThis.ExcelJS.Workbook');
    check('App shell loads (6 steps, reader ready)', steps === 6 && excelReady, `${steps} steps`);
    await shot('01-idle');

    // 2. error state: a file that is not a workbook
    const fake = path.join(SHOTS, 'not-a-timetable.xlsx');
    await writeFile(fake, 'this is definitely not a spreadsheet');
    await setFile(fake);
    const errorText = await waitForAnyText(evaluate,
      ["doesn't appear to be a supported", "couldn't read this timetable"],
      'the upload error message');
    check('Invalid file is refused with honest copy',
      errorText.includes("doesn't appear to be a supported miva timetable") || errorText.includes("couldn't read this timetable file"),
      errorText.match(/this doesn't appear[^.]*\.|we couldn't read[^.]*\./)?.[0]);
    check('Error state keeps the retry affordance', errorText.includes('choose file'));
    await shot('02-invalid-file');
    await click(evaluate, '[data-action="upload/reset"]');

    // 3. real workbook
    await waitFor(evaluate, '!!document.getElementById("tf-file")', 'a clean upload screen after the error');
    await setFile(WORKBOOK);
    const loaded = await waitForText(evaluate, 'timetable loaded', 'the loaded upload screen', 180000);
    check('Real workbook upload reports derived facts',
      loaded.includes('4557 lessons') && loaded.includes('559 courses') && loaded.includes('161 lesson links need verification'),
      loaded.match(/\d+ lessons|\d+ courses|\d+ lesson links need verification/g)?.join(' · '));
    const footer = await footerText(evaluate);
    check('The page states the privacy promise', footer.includes('nothing is uploaded to a server'), footer.slice(0, 60));
    await shot('03-loaded');

    // 4. period selection (Phase 8.1): which slice of the workbook to use
    await click(evaluate, '[data-action="upload/continue"]');
    await waitFor(evaluate, 'document.querySelector(".tf-step--current")?.textContent.includes("Period")', 'the period step');
    const periodOptions = await evaluate(`(() => {
      const buttons = [...document.querySelectorAll('[data-action="period/select"]')];
      return {
        total: buttons.length,
        months: buttons.filter((b) => b.dataset.id !== "all").length,
        all: buttons.some((b) => b.dataset.id === "all"),
        preselected: buttons.some((b) => b.getAttribute("aria-pressed") === "true"),
        first: buttons[0]?.innerText.replace(/\\s+/g, " ") ?? "",
      };
    })()`);
    check('Period options come from the workbook, with nothing pre-selected',
      periodOptions.total === 14 && periodOptions.months === 13 && periodOptions.all && !periodOptions.preselected,
      `${periodOptions.months} months + all, first="${periodOptions.first}", preselected=${periodOptions.preselected}`);
    const periodLead = await pageText(evaluate);
    check('The period screen states the real bounds of the upload',
      /contains lessons from \d+ \w+ \d{4} to \d+ \w+ \d{4}/.test(periodLead),
      periodLead.match(/contains lessons from [^.]*\./)?.[0]);
    await shot('12-period-selection', { full: true });

    await click(evaluate, '[data-action="period/continue"]');
    const refused = await waitForText(evaluate, 'choose which period', 'the "choose a period" refusal');
    check('Continuing without a period is refused, not guessed',
      refused.includes('choose which period of this timetable') &&
        (await currentStep(evaluate)).includes('Period'));

    await click(evaluate, '[data-action="period/select"][data-id="2026-11"]');
    const futureText = await pageText(evaluate);
    check('A month option reports its own lesson and course counts',
      futureText.includes('542 lessons') && futureText.includes('540 courses'),
      await summaryText(evaluate));
    check('A period past the workbook month carries an informational notice',
      futureText.includes('future timetable information') && futureText.includes('may be updated in a later timetable release'));
    await shot('15-future-period-notice', { full: true });

    await click(evaluate, '[data-action="period/continue"]');
    await waitFor(evaluate, 'document.querySelector(".tf-step--current")?.textContent.includes("Courses")', 'the courses step for the chosen month');
    const novemberCourses = await pageText(evaluate);
    check('The catalogue is built from the period, not the whole workbook',
      novemberCourses.includes('540 courses found') && novemberCourses.includes('course list for november 2026'),
      novemberCourses.match(/\d+ courses found/)?.[0]);
    check('The future notice follows the student to course selection',
      novemberCourses.includes('future timetable information'));
    await shot('13-selected-period-course-selection', { full: true });

    // custom range: refused when it makes no sense, accepted when it does
    await click(evaluate, 'button[data-action="step/goto"][data-step="period"]');
    await waitFor(evaluate, 'document.querySelector(".tf-step--current")?.textContent.includes("Period")', 'going back to the period step');
    await setDate(evaluate, '#tf-period-from', '2026-11-01');
    await setDate(evaluate, '#tf-period-to', '2026-09-01');
    await click(evaluate, '[data-action="period/range/apply"]');
    const orderText = await waitForText(evaluate, 'start date cannot be after', 'the out-of-order refusal');
    check('An out-of-order custom range is refused with a plain reason',
      orderText.includes('the start date cannot be after the end date'));
    await setDate(evaluate, '#tf-period-from', '2026-09-01');
    await setDate(evaluate, '#tf-period-to', '2026-09-30');
    await click(evaluate, '[data-action="period/range/apply"]');
    const customText = await pageText(evaluate);
    check('A custom range projects exactly the days it covers',
      customText.includes('464 lessons') && customText.includes('462 courses') &&
        customText.includes('1 sep 2026 – 30 sep 2026') && customText.includes('custom date range'),
      await summaryText(evaluate));
    await shot('16-custom-range', { full: true });

    // the student states the whole workbook, then the Phase 8 flow continues
    await click(evaluate, '[data-action="period/select"][data-id="all"]');
    await click(evaluate, '[data-action="period/continue"]');
    await waitFor(evaluate, 'document.querySelector(".tf-step--current")?.textContent.includes("Courses")', 'the courses step for all dates');

    // 5. course selection, by search + click
    for (const code of PICKS) {
      await evaluate(`(() => { const i = document.querySelector('input[data-action="search"]'); i.value = ${JSON.stringify(code)}; i.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
      await waitFor(evaluate, `!!document.querySelector('button[data-action="course/toggle"][data-code=${JSON.stringify(code)}]')`, `the ${code} row`);
      await click(evaluate, `button[data-action="course/toggle"][data-code=${JSON.stringify(code)}]`);
    }
    const selectedText = await pageText(evaluate);
    check('Six courses selected from the catalogue', selectedText.includes('6 courses selected'), selectedText.match(/\d+ courses? selected/)?.[0]);
    check('Selection can be searched, not guessed', (await evaluate('document.querySelectorAll("button[data-action=\\"course/toggle\\"]").length')) <= 61);
    await shot('04-courses');

    // 5. design + templates
    await click(evaluate, '[data-action="courses/continue"]');
    await waitFor(evaluate, 'document.querySelector(".tf-step--current")?.textContent.includes("Design")', 'the design step');
    const templates = ['dark', 'focus', 'timeline'];
    let templateOk = true;
    for (const id of templates) {
      await click(evaluate, `[data-action="template/select"][data-id="${id}"]`);
      const active = await evaluate(`document.querySelector('[data-template="${id}"]') !== null`);
      if (!active) templateOk = false;
    }
    check('Templates switch on the design screen', templateOk, templates.join(', '));
    await shot('05-design');

    // 6. preview: verified vs held-back vs candidates
    await click(evaluate, 'button[data-action="step/goto"][data-step="preview"]');
    await waitFor(evaluate, 'document.querySelector(".tf-step--current")?.textContent.includes("Preview")', 'the preview step');
    const verifiedHref = await evaluate(`document.querySelector('.tf-lesson[data-course="IFT 211"] a.tf-btn--join')?.href ?? ""`);
    check('Verified lesson is a real clickable join link', /^https:\/\/meet\.google\.com\//.test(verifiedHref), verifiedHref.slice(0, 48));

    // the choices live in a collapsed <details>: open it like a student would
    await evaluate(`document.querySelector('.tf-lesson[data-course="NSC 309"] summary')?.click()`);
    await sleep(250);
    const nsc = await block(evaluate, '.tf-lesson[data-course="NSC 309"]');
    const candidateUrls = nsc ? (nsc.text.match(/meet\.google\.com/g) ?? []).length : 0;
    check('NSC 309 candidates are shown, none clickable',
      nsc && nsc.links === 0 && nsc.text.includes('needs verification') && candidateUrls >= 2 && nsc.text.includes('nothing was chosen for you'),
      nsc ? `${nsc.links} clickable links, ${candidateUrls} candidate URLs, note=${nsc.text.includes('nothing was chosen for you')}` : 'lesson block missing');
    const cms = await block(evaluate, '.tf-lesson[data-course="CMS 302"]');
    check('Title mismatch explains itself under the state',
      cms && cms.reason === 'title-mismatch' && cms.links === 0 && cms.text.includes('check it is your class'),
      cms ? `reason=${cms.reason}` : 'lesson block missing');
    const previewText = await pageText(evaluate);
    check('Preview counts match the selection', previewText.includes('51 lessons') && previewText.includes('42 links ready') && previewText.includes('9 need verification'),
      await statsText(evaluate));
    await shot('06-preview');

    // 7. back and forward
    await click(evaluate, 'button[data-action="step/goto"][data-step="courses"]');
    await waitFor(evaluate, 'document.querySelector(".tf-step--current")?.textContent.includes("Courses")', 'going back to courses');
    const stillSelected = await pageText(evaluate);
    check('Going back keeps the selection', stillSelected.includes('6 courses selected'));
    await click(evaluate, '[data-action="courses/continue"]');
    await waitFor(evaluate, 'document.querySelector(".tf-step--current")?.textContent.includes("Design")', 'returning to design');
    await click(evaluate, 'button[data-action="step/goto"][data-step="preview"]');
    await waitFor(evaluate, 'document.querySelector(".tf-step--current")?.textContent.includes("Preview")', 'returning to preview');
    const again = await pageText(evaluate);
    check('Going forward serves the same timetable', again.includes('51 lessons') && again.includes('42 links ready'));

    // 8. calendar screen
    await click(evaluate, '[data-action="preview/confirm"]');
    await waitFor(evaluate, 'document.querySelector(".tf-step--current")?.textContent.includes("Calendar")', 'the calendar step');
    const googleCount = await evaluate('document.querySelectorAll(\'a[href*="calendar.google.com/calendar/render"]\').length');
    check('One Google Calendar link per lesson', googleCount === 51, `${googleCount} links`);
    await click(evaluate, 'input[data-action="calendar/reminder/set"][data-minutes="30"]');
    const reminderSet = await evaluate('document.querySelector(\'input[data-action="calendar/reminder/set"][data-minutes="30"]\')?.checked === true');
    check('Reminder choice is interactive state', reminderSet);
    await shot('07-calendar');

    // 9. export -> completion
    await click(evaluate, '[data-action="calendar/download"]');
    await waitForText(evaluate, 'your timetable is ready.', 'the completion screen', 60000);
    const complete = await pageText(evaluate);
    check('Export finishes on a screen with real totals', complete.includes('51 classes') && complete.includes('7 courses'));
    await shot('08-complete');
    const downloaded = await readdir(path.join(SHOTS, 'downloads')).catch(() => []);
    check('The .ics file is actually downloaded', downloaded.some((name) => name.endsWith('.ics')), downloaded.join(', '));

    // 10. reload behaviour
    await send('Page.reload', { ignoreCache: false });
    await waitFor(evaluate, 'document.readyState === "complete" && !!document.getElementById("tf-file")', 'the app after a reload');
    const afterReload = await pageText(evaluate);
    check('Reload starts clean (nothing is stored anywhere)', !afterReload.includes('timetable loaded') && afterReload.includes('drop your'));
    await shot('09-after-reload');

    // 11. period projection and switching, without a second parse (Phase 8.1)
    await setFile(WORKBOOK);
    await waitForText(evaluate, 'timetable loaded', 'the workbook for the period flow', 180000);
    await click(evaluate, '[data-action="upload/continue"]');
    await waitFor(evaluate, 'document.querySelector(".tf-step--current")?.textContent.includes("Period")', 'the period step (second upload)');
    await click(evaluate, '[data-action="period/select"][data-id="2026-09"]');
    await click(evaluate, '[data-action="period/continue"]');
    await waitFor(evaluate, 'document.querySelector(".tf-step--current")?.textContent.includes("Courses")', 'the courses step for September');
    const septemberCourses = await pageText(evaluate);
    check('A month inside the workbook narrows the catalogue and warns about nothing',
      septemberCourses.includes('462 courses found') && !septemberCourses.includes('future timetable information'),
      septemberCourses.match(/\d+ courses found/)?.[0]);

    const septemberCodes = await evaluate(`[...document.querySelectorAll('button[data-action="course/toggle"]')].slice(0, 2).map((b) => b.dataset.code)`);
    check('The period catalogue is browsable and clickable', septemberCodes.length === 2, septemberCodes.join(', '));
    for (const code of septemberCodes) {
      await click(evaluate, `button[data-action="course/toggle"][data-code=${JSON.stringify(code)}]`);
    }
    await click(evaluate, '[data-action="courses/continue"]');
    await waitFor(evaluate, 'document.querySelector(".tf-step--current")?.textContent.includes("Design")', 'design for the September period');
    await click(evaluate, 'button[data-action="step/goto"][data-step="preview"]');
    await waitFor(evaluate, 'document.querySelector(".tf-step--current")?.textContent.includes("Preview")', 'the September preview');
    const septemberWeeks = await evaluate('[...document.querySelectorAll("[data-week]")].map((el) => el.dataset.week.slice(0, 7))');
    check('The preview contains only the chosen month',
      septemberWeeks.length > 0 && septemberWeeks.every((month) => month === '2026-09'),
      `${septemberWeeks.length} week blocks: ${[...new Set(septemberWeeks)].join(', ')}`);
    await shot('14-selected-period-preview', { full: true });

    // change the period: same workbook, and the old timetable is never served
    await click(evaluate, 'button[data-action="step/goto"][data-step="period"]');
    await waitFor(evaluate, 'document.querySelector(".tf-step--current")?.textContent.includes("Period")', 'going back to the period step');
    await click(evaluate, '[data-action="period/select"][data-id="2026-11"]');
    await waitFor(evaluate, 'document.querySelector(\'[data-action="period/select"][data-id="2026-11"]\')?.getAttribute("aria-pressed") === "true"', 'November chosen');
    const periodOnlyWeeks = await evaluate('document.querySelectorAll("[data-week]").length');
    check('Switching period clears the previous timetable from the screen',
      periodOnlyWeeks === 0, `${periodOnlyWeeks} week blocks still rendered`);

    await click(evaluate, '[data-action="period/continue"]');
    await waitFor(evaluate, 'document.querySelector(".tf-step--current")?.textContent.includes("Courses")', 'the courses step after the switch');
    const novemberCatalogText = await pageText(evaluate);
    check('The catalogue follows the period switch', novemberCatalogText.includes('540 courses found'),
      novemberCatalogText.match(/\d+ courses found/)?.[0]);
    const staleWeeks = await evaluate('document.querySelectorAll("[data-week]").length');
    check('No lesson of the previous period survives anywhere in the DOM', staleWeeks === 0, `${staleWeeks} week blocks`);
    const novemberCodes = await evaluate(`[...document.querySelectorAll('button[data-action="course/toggle"]')].slice(0, 2).map((b) => b.dataset.code)`);
    for (const code of novemberCodes) {
      const pressed = await evaluate(`document.querySelector('button[data-action="course/toggle"][data-code=${JSON.stringify(code)}]')?.getAttribute("aria-pressed")`);
      if (pressed !== 'true') await click(evaluate, `button[data-action="course/toggle"][data-code=${JSON.stringify(code)}]`);
    }
    await click(evaluate, '[data-action="courses/continue"]');
    await waitFor(evaluate, 'document.querySelector(".tf-step--current")?.textContent.includes("Design")', 'design for the November period');
    await click(evaluate, 'button[data-action="step/goto"][data-step="preview"]');
    await waitFor(evaluate, 'document.querySelector(".tf-step--current")?.textContent.includes("Preview")', 'the November preview');
    const novemberWeeks = await evaluate('[...document.querySelectorAll("[data-week]")].map((el) => el.dataset.week.slice(0, 7))');
    check('The regenerated preview contains only the new period',
      novemberWeeks.length > 0 && novemberWeeks.every((month) => month === '2026-11'),
      `${novemberWeeks.length} week blocks: ${[...new Set(novemberWeeks)].join(', ')}`);

    // 12. mobile viewport — start from a clean upload screen, like a first visit
    await send('Page.reload', { ignoreCache: false });
    await waitFor(evaluate, 'document.readyState === "complete" && !!document.getElementById("tf-file")', 'a clean app before the mobile checks');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    const idleOverflow = await evaluate('document.documentElement.scrollWidth');
    check('Mobile: the upload screen fits 390px', idleOverflow <= 391, `scrollWidth=${idleOverflow}`);
    await setFile(WORKBOOK);
    await waitForText(evaluate, 'timetable loaded', 'the upload screen at mobile width', 180000);
    const mobileOverflow = await evaluate('document.documentElement.scrollWidth');
    check('Mobile: the loaded screen fits 390px', mobileOverflow <= 391, `scrollWidth=${mobileOverflow}`);
    await shot('10-mobile-loaded');
    await click(evaluate, '[data-action="upload/continue"]');
    await waitFor(evaluate, 'document.querySelector(".tf-step--current")?.textContent.includes("Period")', 'the period step at mobile width');
    const mobilePeriodOverflow = await evaluate('document.documentElement.scrollWidth');
    check('Mobile: the period screen fits 390px', mobilePeriodOverflow <= 391, `scrollWidth=${mobilePeriodOverflow}`);
    await shot('17-mobile-period-selection', { full: true });
    await click(evaluate, '[data-action="period/select"][data-id="all"]');
    await click(evaluate, '[data-action="period/continue"]');
    await waitFor(evaluate, 'document.querySelector(".tf-step--current")?.textContent.includes("Courses")', 'the courses step at mobile width');
    for (const code of PICKS) {
      await evaluate(`(() => { const i = document.querySelector('input[data-action="search"]'); i.value = ${JSON.stringify(code)}; i.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
      await waitFor(evaluate, `!!document.querySelector('button[data-action="course/toggle"][data-code=${JSON.stringify(code)}]')`, `the ${code} row (mobile)`);
      await click(evaluate, `button[data-action="course/toggle"][data-code=${JSON.stringify(code)}]`);
    }
    await click(evaluate, '[data-action="courses/continue"]');
    await click(evaluate, 'button[data-action="step/goto"][data-step="preview"]');
    await waitFor(evaluate, 'document.querySelector(".tf-step--current")?.textContent.includes("Preview")', 'the preview step at mobile width');
    const mobilePreviewOverflow = await evaluate('document.documentElement.scrollWidth');
    check('Mobile: the timetable preview fits 390px (grid scrolls inside its own box)', mobilePreviewOverflow <= 391, `scrollWidth=${mobilePreviewOverflow}`);
    await shot('11-mobile-preview');

    // 13. console hygiene for the whole run
    const realErrors = consoleErrors.filter((message) => !/favicon|Download is no longer allowed|net::ERR_ABORTED/i.test(message));
    check('No console errors or uncaught exceptions during the run', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
  } catch (error) {
    check(`workflow completed: ${error.message}`, false);
    await shot('99-failure').catch(() => {});
  } finally {
    ws.close();
    chrome.kill();
    const result = {
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      passed: checks.filter((item) => item.ok).length,
      failed: checks.filter((item) => !item.ok).length,
      checks,
      screenshots: screenshots.map((item) => item.file),
      consoleErrors,
    };
    await writeFile(path.join(ROOT, 'output', 'phase8_1-browser.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(`\n${result.passed}/${checks.length} browser checks passed; screenshots in ${SHOTS}`);
    process.exitCode = result.failed === 0 ? 0 : 1;
  }
}

await main();
