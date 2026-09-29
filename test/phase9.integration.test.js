/**
 * Phase 9 — MivaPulse ↔ TimetableFlow integration tests.
 *
 * These tests live in the HOST repository because they verify the host side
 * of the contract: the Study Lab tool entry, the mount elements, the import
 * map, lazy loading, the vendored ExcelJS asset, the host adapter's
 * boundaries and the theme mapping. The engine's own behaviour is covered by
 * the 203-test TimetableFlow suite; where an integration test needs engine
 * behaviour it imports the engine in place (../timetableflow/) — the same
 * tree the browser loads.
 *
 * The browser-behavioural half of the contract (upload → period → courses →
 * design → preview → calendar → complete, return to Study Lab, mobile, both
 * themes) is driven by scripts/phase9-browser.mjs against a plain static
 * server, exactly as the app is deployed.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadWorkbook, processWorkbook } from '../timetableflow/src/index.js';
import { periodOptions, projectDataset } from '../timetableflow/src/student/period.js';
import { courseCatalog, selectCourses } from '../timetableflow/src/student/selection.js';
import { buildStudentTimetable, linkState } from '../timetableflow/src/student/timetable.js';
import { toICalendar } from '../timetableflow/src/export/ical.js';
import { setExcelJS, parseWorkbookBytes } from '../timetableflow/src/app/excelAdapter.js';
import { TEMPLATES } from '../timetableflow/src/ui/templates.js';
import { reduce } from '../timetableflow/src/ui/state.js';
import { renderApp } from '../timetableflow/src/ui/screens.js';
import { REFERENCE_WORKBOOK } from '../timetableflow/scripts/validate-real-workbook.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(path.join(ROOT, relativePath), 'utf8');
const exists = (relativePath) => existsSync(path.join(ROOT, relativePath));

const html = read('studylab.html');
const adapter = read('js/timetable-workspace.js');
const hostCss = read('css/timetable-workspace.css');

test('1. Study Lab exposes Timetable as a distinct tool', () => {
  assert.ok(html.includes('id="tabTimetable"'), 'the Timetable tool tab exists');
  assert.ok(html.includes('id="timetableView"'), 'the Timetable workspace view exists');
  assert.ok(html.includes('js/timetable-workspace.js'), 'the host adapter is loaded');
  assert.ok(html.includes('id="tabNotes"'), 'the existing tools keep their own destination');
  assert.ok(html.includes('id="notesView"'), 'the existing Study Lab content is preserved');
});

test('2. the workspace provides the engine mount contract', () => {
  const view = html.slice(html.indexOf('id="timetableView"'));
  assert.ok(view.includes('id="app"'), '#app mount exists');
  assert.ok(view.includes('id="tf-status"'), '#tf-status live region exists');
  assert.ok(view.includes('role="status"') && view.includes('aria-live="polite"'), 'the live region is announced');
});

test('3. the import map points the engine namespace at the engine tree', () => {
  const mapMatch = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  assert.ok(mapMatch, 'an import map is declared');
  const map = JSON.parse(mapMatch[1]);
  assert.equal(map.imports['/src/'], '/timetableflow/src/', 'the engine /src/ namespace is mapped');
  // the map must be declared before any module script
  const mapIndex = html.indexOf('type="importmap"');
  const firstModule = html.indexOf('type="module"');
  assert.ok(firstModule === -1 || mapIndex < firstModule, 'the import map comes first');

  // every absolute entry import in the engine glue resolves under the map
  const glue = read('timetableflow/public/app.js');
  const specifiers = [...glue.matchAll(/from\s+'((\/src\/[^']+))'/g)].map((m) => m[1]);
  assert.ok(specifiers.length >= 4, 'the engine glue uses the /src/ namespace');
  for (const specifier of specifiers) {
    const target = path.join(ROOT, 'timetableflow', specifier);
    assert.ok(existsSync(target), `${specifier} resolves to ${path.relative(ROOT, target)}`);
  }
});

test('4. the engine lazy-loads: nothing engine-related loads with the page', () => {
  assert.ok(!html.includes('src="/timetableflow/public/app.js"'), 'no eager engine script tag');
  assert.ok(!html.includes('href="/timetableflow/public/styles.css"'), 'no eager engine stylesheet');
  assert.ok(adapter.includes('import(ENGINE_MODULE)'), 'the adapter dynamic-imports the engine');
  assert.ok(adapter.includes("link.rel = 'stylesheet'"), 'the engine stylesheet is injected on demand');
  assert.ok(adapter.includes('data-tf-styles'), 'the injected stylesheet is marked');
});

test('5. ExcelJS is vendored as a committed static asset and really parses', () => {
  const vendor = 'timetableflow/public/vendor/exceljs.min.js';
  assert.ok(exists(vendor), 'the browser bundle is committed');

  // The engine package is "type": "module", so require() would treat the bundle
  // as an empty ESM namespace. Evaluate it in a CommonJS context instead —
  // exactly what the browser's classic <script> tag does.
  const source = readFileSync(path.join(ROOT, vendor), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', source)(mod, mod.exports);
  const ExcelJS = mod.exports;
  assert.equal(typeof ExcelJS.Workbook, 'function', 'the bundle exposes Workbook');

  // no browser-facing file reaches into node_modules for the bundle
  for (const file of ['studylab.html', 'js/timetable-workspace.js', 'timetableflow/public/index.html', 'timetableflow/public/app.js']) {
    assert.ok(!read(file).includes('node_modules'), `${file} does not reference node_modules`);
  }

  // the vendored bundle drives the engine's own adapter on the real workbook
  setExcelJS(ExcelJS);
  return readFile(REFERENCE_WORKBOOK)
    .then((bytes) => parseWorkbookBytes(bytes, { filename: path.basename(REFERENCE_WORKBOOK) }))
    .then((dataset) => {
      assert.equal(dataset.entries.length, 4557, 'the vendored bundle parses the real workbook');
    });
});

test('6. the host adapter contains no domain logic', () => {
  const forbidden = [
    'processWorkbook', 'parseWorkbookBytes', 'parseTimetableSheet', 'classifyWorkbook',
    'toICalendar', 'periodOptions', 'buildStudentTimetable', 'resolveEntries',
    'buildLinkIndex', 'linkState', 'meet.google', 'setExcelJS', 'Workbook', 'conflict',
  ];
  for (const token of forbidden) {
    assert.ok(!adapter.includes(token), `the adapter must not contain ${token}`);
  }
  // the adapter only knows the engine's public glue and mount contract
  assert.ok(adapter.includes('/timetableflow/public/app.js'), 'the adapter references the engine glue');
});

test('7. the host maps engine tokens for both themes and adds no theme switch', () => {
  for (const theme of ['light', 'dark']) {
    const block = hostCss.match(new RegExp(`:root\\[data-theme="${theme}"\\]\\s*\\{([\\s\\S]*?)\\}`));
    assert.ok(block, `the ${theme} token block exists`);
    for (const token of ['--bg', '--surface', '--text', '--brand', '--radius', '--shadow']) {
      assert.ok(block[1].includes(`${token}:`), `${token} is mapped in ${theme}`);
    }
    assert.ok(block[1].includes('color-scheme'), `color-scheme is set in ${theme}`);
  }
  assert.ok(!hostCss.includes('theme-toggle') && !adapter.includes('data-theme'), 'the host controls the theme alone');
  // the mapping outranks the engine's plain :root block
  assert.ok(hostCss.includes(':root[data-theme='), 'the mapping uses the theme attribute selector');
});

test('8. all six timetable templates are still registered', () => {
  assert.equal(TEMPLATES.length, 6, 'minimal, color-pop, glass, dark, focus, mobile-timeline');
  const ids = TEMPLATES.map((template) => template.id);
  for (const id of ['minimal', 'color-pop', 'glass', 'dark', 'focus', 'timeline']) {
    assert.ok(ids.includes(id), `${id} template is present`);
  }
});

test('9. period discovery works through the engine on the real workbook', async () => {
  const dataset = processWorkbook(await loadWorkbook(REFERENCE_WORKBOOK));
  const options = periodOptions(dataset.entries);
  assert.equal(options.length, 13, 'thirteen calendar months are discovered');
  assert.equal(options[0].id, '2024-11');
  assert.equal(options.at(-1).id, '2026-11');
  const { periodChoices } = await import('../timetableflow/src/ui/selectors.js');
  const choices = periodChoices(dataset);
  const all = choices.find((choice) => choice.type === 'all');
  assert.equal(all.lessons, 4557, 'the explicit all-dates option covers every lesson');
  assert.equal(choices.length, 14, 'thirteen months plus the all-dates option');
});

test('10. course selection operates on the period projection, not the workbook', async () => {
  const dataset = processWorkbook(await loadWorkbook(REFERENCE_WORKBOOK));
  const september = projectDataset(dataset, periodOptions(dataset.entries).find((option) => option.id === '2026-09'));
  assert.equal(september.entries.length, 464, 'the September projection');
  assert.equal(courseCatalog(september.entries).length, 462, 'courses with a September lesson');
  assert.ok(courseCatalog(september.entries).length < courseCatalog(dataset.entries).length,
    'the period narrows the catalogue');
});

test('11. confidence states survive integration unchanged', async () => {
  const dataset = processWorkbook(await loadWorkbook(REFERENCE_WORKBOOK));
  const states = { verified: 0, 'needs-verification': 0, missing: 0 };
  for (const entry of dataset.entries) {
    states[linkState(entry)] += 1;
  }
  assert.deepEqual(states, { verified: 4396, 'needs-verification': 161, missing: 0 },
    'the real-workbook confidence baseline is untouched');
});

test('12. conflicts survive integration', async () => {
  const dataset = processWorkbook(await loadWorkbook(REFERENCE_WORKBOOK));
  const september = projectDataset(dataset, periodOptions(dataset.entries).find((option) => option.id === '2026-09'));
  // derive a real overlapping pair from the data instead of hard-coding one
  const byDate = new Map();
  for (const entry of september.entries) {
    const list = byDate.get(entry.date) ?? [];
    list.push(entry);
    byDate.set(entry.date, list);
  }
  let pair = null;
  for (const list of byDate.values()) {
    for (let i = 0; i < list.length && !pair; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        if (a.startTime < b.endTime && b.startTime < a.endTime) {
          pair = [a.courseCode, b.courseCode];
          break;
        }
      }
    }
    if (pair) break;
  }
  assert.ok(pair, 'the September projection contains an overlapping pair');
  const selection = selectCourses(september.entries, pair);
  const timetable = buildStudentTimetable(selection.entries, { selection: selection.requested });
  assert.ok(timetable.conflicts.length > 0, 'overlapping lessons are still reported');
  assert.ok(timetable.conflicts.every((conflict) => conflict.entries.length === 2),
    'every conflict names both lessons');
  assert.ok(timetable.conflicts[0].overlapMinutes > 0, 'the overlap duration is reported');
});

test('13. calendar export works and only verified lessons export URLs', async () => {
  const dataset = processWorkbook(await loadWorkbook(REFERENCE_WORKBOOK));
  const september = projectDataset(dataset, periodOptions(dataset.entries).find((option) => option.id === '2026-09'));
  const selection = selectCourses(september.entries, ['IFT 211', 'CMS 302']);
  const timetable = buildStudentTimetable(selection.entries, { selection: selection.requested });
  const { ics } = toICalendar(timetable.entries, { dtStamp: '2026-09-01T10:00:00.000Z' });
  const urls = [...ics.matchAll(/^URL:(.+)$/gm)].map((match) => match[1]);
  const verified = timetable.entries.filter((entry) => linkState(entry) === 'verified');
  assert.equal(urls.length, verified.length, 'one exported URL per verified lesson');
  assert.ok(urls.every((url) => verified.some((entry) => entry.lessonUrl === url)),
    'exported URLs are exactly the verified lesson URLs');
  const heldBack = timetable.entries.filter((entry) => linkState(entry) === 'needs-verification' && entry.lessonUrl);
  assert.ok(heldBack.length > 0, 'the selection contains a held-back lesson with a URL');
  assert.ok(urls.every((url) => !heldBack.some((entry) => entry.lessonUrl === url)),
    'held-back URLs are never exported');
  assert.ok(!ics.includes('2026-10'), 'the export stays inside the chosen period');
});

test('14. returning to Study Lab preserves the workspace (adapter contract)', () => {
  // the engine is imported at most once and never unmounted: switching tools
  // only toggles visibility, so the timetable survives without persistence.
  assert.ok(adapter.includes('engineLoaded = true'), 'the engine is loaded once');
  assert.ok(adapter.includes('??='), 'repeated opens reuse the in-flight load');
  for (const pattern of ['removeChild', 'innerHTML = ""', "innerHTML = ''", 'unmount']) {
    assert.ok(!adapter.includes(pattern), `the adapter must not ${pattern}`);
  }
  assert.ok(adapter.includes('timetableView.hidden = !timetable'), 'switching tools only toggles visibility');
});

test('15. no lesson or selected course goes missing from the uploaded timetable', async () => {
  const dataset = processWorkbook(await loadWorkbook(REFERENCE_WORKBOOK));
  const { periodChoices } = await import('../timetableflow/src/ui/selectors.js');
  const choices = periodChoices(dataset);

  // 1. every period projection keeps every lesson of every course in it
  for (const choice of choices) {
    const projected = projectDataset(dataset, choice);
    const codes = [...new Set(projected.entries.map((entry) => entry.courseCode))];
    const selection = selectCourses(projected.entries, codes);
    const timetable = buildStudentTimetable(selection.entries, { selection: selection.requested });
    assert.equal(timetable.entries.length, projected.entries.length,
      `${choice.label}: all ${projected.entries.length} lessons are kept`);
    const timetableCodes = new Set(timetable.entries.map((entry) => entry.courseCode));
    for (const code of codes) {
      assert.ok(timetableCodes.has(code), `${choice.label}: ${code} is present`);
    }
  }

  // 2. the union of all month projections is the whole dataset — period
  //    filtering never loses a lesson overall
  const months = choices.filter((choice) => choice.type === 'month');
  const inAnyMonth = new Set();
  for (const month of months) {
    for (const entry of projectDataset(dataset, month).entries) inAnyMonth.add(entry);
  }
  const dated = new Set(dataset.entries.filter((entry) => entry.date));
  assert.equal(inAnyMonth.size, dated.size, 'no lesson is lost to period filtering');

  // 3. a realistic selection keeps every lesson of every selected course
  const september = projectDataset(dataset, months.find((month) => month.id === '2026-09'));
  for (const code of ['IFT 211', 'MTH 209', 'CMS 302']) {
    const expected = september.entries.filter((entry) => entry.courseCode === code).length;
    const selection = selectCourses(september.entries, [code]);
    const timetable = buildStudentTimetable(selection.entries, { selection: selection.requested });
    const actual = timetable.entries.filter((entry) => entry.courseCode === code).length;
    assert.equal(actual, expected, `${code}: all ${expected} September lessons kept`);
  }

  // 4. every course the student can type is found when it has lessons in the period
  const catalogue = courseCatalog(september.entries);
  const selection = selectCourses(september.entries, catalogue.map((course) => course.courseCode));
  assert.equal(selection.unmatched.length, 0, 'no course with lessons in the period is unmatched');
  assert.equal(selection.entries.length, september.entries.length, 'selecting the whole catalogue keeps every lesson');
});

test('16. the end screen offers add-to-calendar and an HTML download with clickable links', async () => {
  const dataset = processWorkbook(await loadWorkbook(REFERENCE_WORKBOOK));
  const { calendarState } = await import('../timetableflow/test/helpers/uiFlow.js');
  let state = calendarState(dataset, ['IFT 211', 'CMS 302']);
  state = reduce(state, { type: 'calendar/prepare', dtStamp: '2026-09-01T10:00:00.000Z' });

  const html = renderApp(state);
  assert.ok(html.includes('Download calendar (.ics)'), 'the calendar download is offered');
  assert.ok(html.includes('Download timetable (.html)'), 'the HTML download is offered');
  assert.ok(html.includes('Add to Google Calendar'), 'per-lesson Google links are offered');

  const file = state.calendar.html;
  const verified = state.timetable.entries.filter((entry) => linkState(entry) === 'verified');
  assert.ok(verified.length > 0, 'the selection has verified lessons');
  const clickable = (file.match(/<a class="link link-ok" href="https:\/\/meet\.google\.com[^"]*"/g) ?? []).length;
  assert.equal(clickable, verified.length, 'exactly one clickable link per verified lesson');
  const verifiedUrls = new Set(verified.map((entry) => entry.lessonUrl));
  const heldBack = state.timetable.entries.filter((entry) => linkState(entry) === 'needs-verification' && entry.lessonUrl && !verifiedUrls.has(entry.lessonUrl));
  for (const entry of heldBack) {
    assert.ok(!file.includes(`href="${entry.lessonUrl}"`), 'held-back links are never clickable');
  }
});
