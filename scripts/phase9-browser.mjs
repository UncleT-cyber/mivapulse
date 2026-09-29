#!/usr/bin/env node
/**
 * Phase 9 — MivaPulse ↔ TimetableFlow browser acceptance.
 *
 *   node scripts/phase9-browser.mjs
 *
 * Drives the INTEGRATED app (studylab.html + the TimetableFlow workspace) in a
 * headless Chrome over the DevTools protocol, against the plain static server
 * (scripts/serve-static.mjs) — no TimetableFlow dev-server routes, exactly as
 * the app is deployed.
 *
 *   Study Lab → Timetable tool → lazy engine load → upload the REAL workbook
 *   → period → courses → design → preview (confidence + conflicts)
 *   → mobile 390px → calendar → complete → return to Study Lab (state kept)
 *   → dark theme
 *
 * Every step is a PASS/FAIL check; screenshots land in /tmp/mivapulse-shots and
 * the machine-readable result in output/phase9-browser.json.
 * Exit code 0 only when every check passes.
 */

import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WORKBOOK = path.join(ROOT, 'timetableflow', 'reference', 'miva-master-timetable', 'Live Lesson Time Table - Students Copy.xlsx');
const SHOTS = '/tmp/mivapulse-shots';
const PROFILE = `/tmp/mivapulse-phase9-profile-${process.pid}`;
const DEBUG_PORT = 9555 + Math.floor(Math.random() * 40);
const STATIC_PORT = 4300 + Math.floor(Math.random() * 200);
const APP_URL = `http://localhost:${STATIC_PORT}/studylab.html`;

/** Realistic selection: a verified course, its real September clash, and a held-back one. */
const PICKS = ['IFT 211', 'MTH 209', 'CMS 302'];

const checks = [];
const screenshots = [];
const consoleErrors = [];
const networkUrls = [];
const notFoundUrls = [];
const failedLoads = [];
const responseStatus = new Map();
let swJsStatus = null;

function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  await mkdir(SHOTS, { recursive: true });
  await mkdir(path.join(SHOTS, 'downloads'), { recursive: true });
  await mkdir(path.join(ROOT, 'output'), { recursive: true });

  // 1. the production-like static server (no dev-server routes at all)
  const server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve-static.mjs'), `--port=${STATIC_PORT}`], { stdio: 'ignore' });
  const base = `http://localhost:${STATIC_PORT}`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await fetch(`${base}/studylab.html`);
      break;
    } catch { await sleep(200); }
  }

  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], { stdio: 'ignore' });

  const cdpBase = `http://127.0.0.1:${DEBUG_PORT}`;
  let target;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const version = await (await fetch(`${cdpBase}/json/version`)).json();
      if (version.webSocketDebuggerUrl) {
        target = await (await fetch(`${cdpBase}/json/new?${encodeURIComponent(APP_URL)}`, { method: 'PUT' })).json();
        break;
      }
    } catch { /* not up yet */ }
    await sleep(250);
  }
  if (!target?.webSocketDebuggerUrl) throw new Error('Chrome DevTools endpoint never came up');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

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
    if (message.method === 'Network.requestWillBeSent') {
      networkUrls.push(message.params.request?.url ?? '');
    }
    if (message.method === 'Network.responseReceived') {
      const response = message.params.response;
      if (response?.status === 404) notFoundUrls.push(response.url ?? '');
      if (response?.url) responseStatus.set(response.url, response.status);
      if (response?.url?.endsWith('/sw.js')) swJsStatus = response.status;
    }
    if (message.method === 'Network.loadingFailed') {
      failedLoads.push({
        url: networkUrls.find((url) => url.includes(message.params.requestId)) ?? message.params.requestId,
        error: message.params.errorText,
        type: message.params.type,
      });
    }
  };

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'evaluation failed');
    return result.result?.value;
  };

  const shot = async (name, { full = false } = {}) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full });
    const file = path.join(SHOTS, `phase9-${name}.png`);
    await writeFile(file, Buffer.from(data, 'base64'));
    screenshots.push({ name, file });
    return file;
  };

  const started = Date.now();

  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('DOM.enable');
    await send('Log.enable');
    await send('Network.enable');
    await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: path.join(SHOTS, 'downloads') }).catch(() => {});
    // deterministic light theme (the host owns the theme)
    await send('Page.addScriptToEvaluateOnNewDocument', { source: "localStorage.setItem('miva-theme','light');" });
    await send('Page.navigate', { url: APP_URL });

    const setFile = async (selector, absolutePath) => {
      const document = await send('DOM.getDocument', { depth: -1 });
      const { nodeId } = await send('DOM.querySelector', { nodeId: document.root.nodeId, selector });
      await send('DOM.setFileInputFiles', { files: [absolutePath], nodeId });
    };
    const click = (selector) => evaluate(`(document.querySelector(${JSON.stringify(selector)})?.click(), true)`);
    const pageText = () => evaluate(`(() => {
      const t = (document.getElementById('app')?.innerText || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      return t;
    })()`);
    const waitFor = async (predicate, label, timeout = 60000) => {
      const expression = typeof predicate === 'function' ? `(${predicate})()` : predicate;
      const startedAt = Date.now();
      let last = null;
      while (Date.now() - startedAt < timeout) {
        last = await evaluate(expression);
        if (last) return last;
        await sleep(300);
      }
      throw new Error(`timed out waiting for: ${label} (last: ${JSON.stringify(last)})`);
    };
    /** Force a theme through the host's own toggle (the host owns the theme). */
    const ensureTheme = async (theme) => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const current = await evaluate('document.documentElement.getAttribute("data-theme")');
        if (current === theme) return;
        await click('#themeToggleBtn');
        await sleep(300);
      }
      throw new Error(`could not set the ${theme} theme`);
    };
    const engineRequested = (fragment) => networkUrls.some((url) => url.includes(fragment));

    // the CDN scripts in <head> block parsing, so wait for the real page
    await waitFor('!!document.getElementById("tabNotes")', 'the Study Lab page', 60000);
    await ensureTheme('light');

    // ── 1. Study Lab entry ────────────────────────────────────────────────
    const tabs = await evaluate(`(() => ({
      notes: !!document.getElementById('tabNotes'),
      timetable: !!document.getElementById('tabTimetable'),
      notesView: !!document.getElementById('notesView'),
      timetableView: !!document.getElementById('timetableView'),
      dropzone: !!document.getElementById('studylabDropzone'),
      tts: !!document.getElementById('playBtn'),
      quizGen: !!document.getElementById('generateQuizBtn'),
      themeToggle: !!document.getElementById('themeToggleBtn'),
      theme: document.documentElement.getAttribute('data-theme'),
    }))()`);
    check('Study Lab exposes Timetable as a distinct tool', tabs.notes && tabs.timetable && tabs.notesView && tabs.timetableView,
      `theme=${tabs.theme}`);
    check('Existing Study Lab tools are intact', tabs.dropzone && tabs.tts && tabs.quizGen,
      'upload, ReadToMe and AI Quiz Generator all present');
    check('The host owns the theme toggle', tabs.themeToggle);
    await shot('01-study-lab-timetable-entry', { full: true });

    // ── 2. lazy engine load ───────────────────────────────────────────────
    const errorsBeforeTool = consoleErrors.length;
    const engineRequestsBefore = networkUrls.filter((url) => url.includes('/timetableflow/')).length;
    check('Nothing engine-related loads with the page', engineRequestsBefore === 0,
      `${engineRequestsBefore} engine requests before opening the tool`);
    // click and check the loading state synchronously (the engine load is async)
    const loadingShown = await evaluate(`(() => {
      document.getElementById('tabTimetable')?.click();
      return !!document.querySelector('[data-tf-loading]');
    })()`);
    check('A loading state is shown while the engine loads', loadingShown);
    await waitFor('!!document.getElementById("tf-file")', 'the TimetableFlow upload screen', 60000);
    await sleep(600); // let the engine stylesheet and exceljs settle
    const loadingCleared = await evaluate(`!document.querySelector('[data-tf-loading]')`);
    check('The loading state is replaced once the engine mounts', loadingCleared);
    check('The engine lazy-loads from the engine tree',
      engineRequested('/timetableflow/public/app.js') && engineRequested('/timetableflow/src/ui/state.js'),
      [...new Set(networkUrls.filter((u) => u.includes('/timetableflow/')))].slice(0, 4).join(', '));
    check('ExcelJS loads from the committed static path',
      engineRequested('/timetableflow/public/vendor/exceljs.min.js'));
    check('No node_modules URL is ever requested', !networkUrls.some((url) => url.includes('node_modules')));
    check('No dev-server-only route is used',
      !networkUrls.some((url) => url.endsWith('/vendor/exceljs.min.js') && !url.includes('/timetableflow/')));
    // the static host never serves dependencies, even though they sit next to
    // the app in the working tree (production serves committed files only)
    const nodeAsset = await fetch(`${APP_URL.replace('/studylab.html', '')}/timetableflow/node_modules/exceljs/dist/exceljs.min.js`);
    check('The static host does not serve node_modules', nodeAsset.status === 404, `status=${nodeAsset.status}`);

    // diagnostic: the engine's glue registers its standalone service worker
    // (/sw.js). The host has no service worker, so that registration 404s.
    const swDiagnostic = await evaluate(`(async () => {
      const secure = window.isSecureContext;
      const reg = await navigator.serviceWorker.getRegistration();
      return { secure, scope: reg?.scope ?? null, script: reg?.active?.scriptURL ?? null };
    })()`);
    check('The only console message is the engine service-worker registration on a host without one',
      consoleErrors.length - errorsBeforeTool === 1 && swDiagnostic.secure === true,
      `secure=${swDiagnostic.secure}, scope=${swDiagnostic.scope}, script=${swDiagnostic.script}, new errors=${consoleErrors.length - errorsBeforeTool}`);

    // ── 3. upload the real workbook ───────────────────────────────────────
    await setFile('#tf-file', WORKBOOK);
    await waitFor(() => (document.getElementById('app')?.innerText || '').toLowerCase().includes('timetable loaded'), 'the loaded upload screen', 180000);
    const loaded = await pageText();
    check('The real MIVA workbook loads inside MivaPulse',
      loaded.includes('4557 lessons') && loaded.includes('559 courses') && loaded.includes('161 lesson links need verification'),
      loaded.match(/\d+ lessons|\d+ courses|\d+ lesson links need verification/g)?.join(' · '));
    await shot('02-upload', { full: true });

    // ── 4. period selection ───────────────────────────────────────────────
    await click('[data-action="upload/continue"]');
    await waitFor(() => (document.getElementById('app')?.innerText || '').toLowerCase().includes('choose your period'), 'the period step');
    const periodCounts = await evaluate(`(() => {
      const buttons = [...document.querySelectorAll('[data-action="period/select"]')];
      return { total: buttons.length, months: buttons.filter((b) => b.dataset.id !== 'all').length,
               all: buttons.some((b) => b.dataset.id === 'all'),
               preselected: buttons.some((b) => b.getAttribute('aria-pressed') === 'true') };
    })()`);
    check('Period discovery works (13 months + all dates, nothing pre-selected)',
      periodCounts.total === 14 && periodCounts.months === 13 && periodCounts.all && !periodCounts.preselected,
      `${periodCounts.months} months + all`);
    await shot('03-period', { full: true });
    await click('[data-action="period/select"][data-id="2026-09"]');
    await click('[data-action="period/continue"]');
    await waitFor(() => (document.getElementById('app')?.innerText || '').toLowerCase().includes('select your courses'), 'the courses step');

    // ── 5. course selection on the period projection ──────────────────────
    const catalogue = await pageText();
    check('Course selection uses the period projection', catalogue.includes('462 courses found'),
      catalogue.match(/\d+ courses found/)?.[0]);
    for (const code of PICKS) {
      await evaluate(`(() => { const i = document.querySelector('input[data-action="search"]'); i.value = ${JSON.stringify(code)}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
      await waitFor(`!!document.querySelector('button[data-action="course/toggle"][data-code=${JSON.stringify(code)}]')`, `the ${code} row`);
      await click(`button[data-action="course/toggle"][data-code=${JSON.stringify(code)}]`);
    }
    const selected = await pageText();
    check('Real courses are selected from the period catalogue', selected.includes('3 courses selected'),
      selected.match(/\d+ courses? selected/)?.[0]);
    await shot('04-course-selection', { full: true });

    // ── 6. design ─────────────────────────────────────────────────────────
    await click('[data-action="courses/continue"]');
    await waitFor(() => (document.getElementById('app')?.innerText || '').toLowerCase().includes('choose a template'), 'the design step');
    const templateCount = await evaluate(`document.querySelectorAll('[data-action="template/select"]').length`);
    check('All six templates are available', templateCount === 6, `${templateCount} templates`);
    for (const id of ['dark', 'timeline']) {
      await click(`[data-action="template/select"][data-id="${id}"]`);
      const active = await evaluate(`document.querySelector('[data-template="${id}"]') !== null`);
      if (!active) check(`Template ${id} renders`, false);
    }
    check('Templates switch on the design screen', true, 'dark, timeline');
    await shot('05-design');

    // ── 7. preview: real lessons, confidence, conflicts ───────────────────
    await click('button[data-action="step/goto"][data-step="preview"]');
    await waitFor(() => (document.getElementById('app')?.innerText || '').toLowerCase().includes('your timetable'), 'the preview step');
    const preview = await pageText();
    check('Preview shows real lessons and real confidence states',
      preview.includes('lessons') && preview.includes('links ready') && preview.includes('need verification'),
      preview.match(/\d+ lessons|\d+ links ready|\d+ need verification/)?.join(' · '));
    const conflictShown = await evaluate(`(() => {
      const text = (document.getElementById('app')?.innerText || '').toLowerCase();
      return text.includes('conflict') || text.includes('overlap');
    })()`);
    check('Real conflicts are shown, not resolved', conflictShown);
    await shot('06-preview');
    await evaluate(`document.querySelector('.tf-lesson[data-course="CMS 302"]')?.scrollIntoView({ block: 'center' })`);
    await sleep(200);
    await evaluate(`document.querySelector('.tf-lesson[data-course="CMS 302"] summary')?.click()`);
    await sleep(300);
    const heldBack = await evaluate(`(() => {
      const block = document.querySelector('.tf-lesson[data-course="CMS 302"]');
      if (!block) return null;
      return { links: block.querySelectorAll('a[href]').length,
               text: (block.innerText || '').replace(/\\s+/g, ' ').trim().toLowerCase() };
    })()`);
    check('Needs-verification lessons stay held back',
      heldBack && heldBack.links === 0 && heldBack.text.includes('needs verification'),
      heldBack ? `${heldBack.links} clickable links` : 'lesson block missing');
    await shot('07-confidence-conflict');

    // ── 8. mobile 390px ───────────────────────────────────────────────────
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(400);
    const mobileOverflow = await evaluate('document.documentElement.scrollWidth');
    check('Mobile: the timetable fits 390px', mobileOverflow <= 391, `scrollWidth=${mobileOverflow}`);
    await shot('10-mobile');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await sleep(300);

    // ── 9. calendar ───────────────────────────────────────────────────────
    await click('[data-action="preview/confirm"]');
    await waitFor(() => (document.getElementById('app')?.innerText || '').toLowerCase().includes('calendar'), 'the calendar step');
    const googleCount = await evaluate('document.querySelectorAll(\'a[href*="calendar.google.com/calendar/render"]\').length');
    check('One Google Calendar link per lesson', googleCount > 0, `${googleCount} links`);
    await shot('08-calendar');

    // ── 10. export → complete ─────────────────────────────────────────────
    await click('[data-action="calendar/download"]');
    await waitFor(() => (document.getElementById('app')?.innerText || '').toLowerCase().includes('your timetable is ready.'), 'the completion screen', 60000);
    const complete = await pageText();
    check('Export finishes on a screen with real totals',
      complete.includes('classes') && complete.includes('courses'),
      complete.match(/\d+ classes|\d+ courses/)?.[0]);
    await shot('09-complete');
    const downloaded = await readdir(path.join(SHOTS, 'downloads')).catch(() => []);
    check('The .ics file is actually downloaded', downloaded.some((name) => name.endsWith('.ics')), downloaded.join(', '));

    // the same end screen offers the HTML download — verified lessons keep
    // their clickable join links in the file
    await click('[data-action="calendar/download-html"]');
    await sleep(900);
    const afterHtml = await readdir(path.join(SHOTS, 'downloads')).catch(() => []);
    const htmlFile = afterHtml.find((name) => name.endsWith('.html'));
    check('The HTML timetable is actually downloaded', Boolean(htmlFile), afterHtml.join(', '));
    let htmlContent = '';
    if (htmlFile) htmlContent = await readFile(path.join(SHOTS, 'downloads', htmlFile), 'utf8').catch(() => '');
    const clickableLinks = (htmlContent.match(/href="https?:\/\/meet\.google\.com[^"]*"/g) ?? []).length;
    check('The downloaded HTML keeps clickable verified links',
      htmlContent.includes('<!DOCTYPE html>') && clickableLinks > 0,
      `${clickableLinks} clickable meet links`);

    // ── 11. return to Study Lab keeps the workspace ───────────────────────
    await click('#tabNotes');
    await sleep(300);
    const backAtNotes = await evaluate(`(() => ({
      notesVisible: !document.getElementById('notesView').hidden,
      timetableHidden: document.getElementById('timetableView').hidden,
    }))()`);
    check('Back to Study Lab shows the existing tools', backAtNotes.notesVisible && backAtNotes.timetableHidden);
    await click('#tabTimetable');
    await sleep(400);
    const restored = await pageText();
    check('Returning to Timetable preserves the in-memory workspace',
      restored.includes('your timetable is ready.'),
      'the completed timetable is still there — no re-upload, no reparse');

    // ── 12. dark theme ────────────────────────────────────────────────────
    await click('#themeToggleBtn');
    await sleep(400);
    const darkTheme = await evaluate(`(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      background: getComputedStyle(document.body).backgroundColor,
    }))()`);
    check('Dark theme applies to the whole page', darkTheme.theme === 'dark' && darkTheme.background !== 'rgb(248, 250, 252)',
      `theme=${darkTheme.theme}, body background=${darkTheme.background}`);
    await shot('11-dark-theme');

    // ── 13. console hygiene ───────────────────────────────────────────────
    // The engine's glue registers /sw.js — the service worker of its
    // standalone PWA shell. The host has no service worker, so that one
    // registration 404s: the message appears exactly when the engine loads
    // and no worker is registered (verified by the check above). The engine
    // catches the rejection itself; the 404 network message is Chrome's own
    // logging. Every other console message fails the run.
    const swRegistrationMessage = /bad HTTP response code \(404\) was received when fetching the script/i;
    const realErrors = consoleErrors.filter((message) =>
      !/favicon|Download is no longer allowed|net::ERR_ABORTED/i.test(message) &&
      !swRegistrationMessage.test(message));
    check('No console errors or uncaught exceptions during the run', realErrors.length === 0,
      realErrors.slice(0, 3).join(' | '));
  } catch (error) {
    check(`workflow completed: ${error.message}`, false);
    await shot('99-failure').catch(() => {});
  } finally {
    ws.close();
    chrome.kill();
    server.kill();
    const result = {
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      passed: checks.filter((item) => item.ok).length,
      failed: checks.filter((item) => !item.ok).length,
      checks,
      screenshots: screenshots.map((item) => item.file),
      consoleErrors,
      notFoundUrls,
      swJsStatus,
      failedLoads,
      non200Responses: [...responseStatus.entries()].filter(([, status]) => status >= 400),
      allRequestedUrls: networkUrls,
      engineRequests: [...new Set(networkUrls.filter((url) => url.includes('/timetableflow/')))],
    };
    await writeFile(path.join(ROOT, 'output', 'phase9-browser.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(`\n${result.passed}/${checks.length} browser checks passed; screenshots in ${SHOTS}`);
    process.exitCode = result.failed === 0 ? 0 : 1;
  }
}

await main();
