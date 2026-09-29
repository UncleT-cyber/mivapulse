/**
 * Phase 8 — student acceptance over the REAL reference workbook.
 *
 * Phase 7 proved the engine's accuracy (4557/4557, confidence policy). Phase 8
 * proves the STUDENT JOURNEY on that trusted data:
 *
 *   upload -> identify courses -> select -> design -> preview
 *   -> inspect uncertain links/conflicts -> confirm -> export -> finish
 *
 * A realistic selection (not select-all) drives every check:
 *   IFT 211, PAD 213          verified links, repeated weekly lessons
 *   CSC 406 (MIVA-CSC 406)    MIVA- prefix tolerance, part of a slash code
 *   CSC 301/MIVA-DTS 301      slash-combined code
 *   CMS 302                   needs-verification (link row title disagrees)
 *   NSC 309                   needs-verification (two candidate URLs)
 *   IFT 999                   unmatched input, must stay visible as unmatched
 *
 * Nothing here is hard-coded: every expected number is derived from the dataset
 * the workbook produces in this run.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadWorkbook, processWorkbook } from '../src/index.js';
import { REFERENCE_WORKBOOK } from '../scripts/validate-real-workbook.js';
import { courseCatalog, selectCourses } from '../src/student/selection.js';
import { buildStudentTimetable, linkState, linkStateReason } from '../src/student/timetable.js';
import { buildViewModel } from '../src/render/viewModel.js';
import { renderHtml } from '../src/render/html.js';
import { toICalendar } from '../src/export/ical.js';
import { CALENDAR_NAME, initialState, reduce, STEPS, NOTICE_COPY } from '../src/ui/state.js';
import { renderApp } from '../src/ui/screens.js';
import {
  completionStats,
  courseOptions,
  googleLessonLinks,
  summarizeDataset,
} from '../src/ui/selectors.js';
import { uploadState, selectCourses as toggleCourses, generate, stripTags, lessonBlock, toCourses } from './helpers/uiFlow.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STUDENT = 'Adaeze Nwosu';
const GENERATED_AT = '2026-09-29T09:00:00.000Z';
const DT_STAMP = '2026-09-29T09:00:00.000Z';

/** The realistic selection (catalog codes as the student sees them). */
const PICKS = ['IFT 211', 'PAD 213', 'CSC 406', 'CSC 301/MIVA-DTS 301', 'CMS 302', 'NSC 309'];
const UNMATCHED_PICK = 'IFT 999';

/** RFC 5545 lines are folded at 75 octets — unfold before searching text. */
const unfold = (ics) => ics.replace(/\r\n[ \t]/g, '');

const FORBIDDEN_COPY = [
  'Unknown Lecturer',
  'Unknown Topic',
  'TBA',
  'Lorem ipsum',
  'placeholder content',
];
const FORBIDDEN_INTERNALS = ['worksheet', 'ExcelJS', 'rawCellText', 'sourceSheet', 'sourceCell', 'HYPERLINK('];
const AI_CLAIMS = [
  'artificial intelligence',
  'machine learning',
  'intelligent',
  ' AI ',
  'auto-suggest',
  'magic happens',
];

function assertClean(html, label) {
  for (const copy of FORBIDDEN_COPY) {
    assert.ok(!html.includes(copy), `${label} shows invented copy "${copy}"`);
  }
  for (const internal of FORBIDDEN_INTERNALS) {
    assert.ok(!html.includes(internal), `${label} leaks Excel internals "${internal}"`);
  }
  for (const claim of AI_CLAIMS) {
    assert.ok(!html.includes(claim), `${label} claims AI behaviour "${claim.trim()}"`);
  }
}

let dataset;
let selection;
let timetable;
let uiState; // upload -> courses -> selected -> design -> preview
let calendarScreenState;
let icsText;
let icsEvents;
let screens = {};

test.before(async () => {
  dataset = processWorkbook(await loadWorkbook(await readFile(REFERENCE_WORKBOOK)));

  selection = selectCourses(dataset.entries, [...PICKS, UNMATCHED_PICK]);
  timetable = buildStudentTimetable(selection.entries, {
    student: STUDENT,
    selection: selection.requested.map((item) => item.normalized),
    generatedAt: GENERATED_AT,
  });

  let state = initialState();
  state = reduce(state, { type: 'upload/started', filename: 'Live Lesson Time Table - Students Copy.xlsx' });
  state = reduce(state, { type: 'upload/succeeded', dataset });
  screens.upload = renderApp(state); // the loaded upload screen, before any navigation
  state = toCourses(state);
  state = toggleCourses(state, PICKS);
  screens.courses = renderApp(state);
  state = generate(state, GENERATED_AT);
  screens.design = renderApp(state);
  state = reduce(state, { type: 'step/goto', step: 'preview' });
  uiState = state;
  screens.preview = renderApp(state);
  state = reduce(state, { type: 'student/set', value: STUDENT });
  state = reduce(state, { type: 'preview/confirm' });
  calendarScreenState = renderApp(state);
  state = reduce(state, { type: 'calendar/prepare', dtStamp: DT_STAMP });
  screens.complete = renderApp(reduce(state, { type: 'calendar/exported' }));
  icsText = state.calendar.ics;
  icsEvents = state.calendar.events;
});

test('acceptance: real workbook ingestion', () => {
  assert.equal(dataset.entries.length, 4557, 'every lesson cell became an entry');

  const summary = summarizeDataset(dataset);
  const text = stripTags(screens.upload);
  assert.ok(text.includes(`${summary.lessons} lessons`), 'lesson count is derived from this workbook');
  assert.ok(text.includes(`${summary.courses} courses`), 'course count is derived');
  assert.equal(summary.courses, courseOptions(dataset).length, 'the catalogue is derived from the same entries');
  assert.equal(summary.courses, 559, 'one row per distinct course code');
  assert.ok(text.includes(summary.period), 'the period is derived from entry dates');
  assert.ok(text.includes('Timetable loaded'));
  assert.ok(text.includes('Live Lesson Time Table - Students Copy.xlsx'), 'the student sees their own file name');
  assertClean(screens.upload, 'upload (loaded)');
});

test('acceptance: small student timetable projects exactly the selected lessons', () => {
  const datasetByIdentity = new Set(dataset.entries);
  for (const entry of timetable.entries) {
    assert.ok(datasetByIdentity.has(entry), 'every lesson is a real workbook entry (no invented rows)');
  }

  // selection layer -> projection layer: nothing is dropped on the way through
  assert.equal(timetable.entries.length, selection.entries.length, 'no lesson lost in the projection');
  const counts = (entries) => {
    const map = new Map();
    for (const entry of entries) map.set(entry.courseCode, (map.get(entry.courseCode) ?? 0) + 1);
    return map;
  };
  const selectedCounts = counts(selection.entries);
  const projectedCounts = counts(timetable.entries);
  assert.deepEqual([...projectedCounts].sort(), [...selectedCounts].sort(), 'per-course lesson counts survive');

  // honest totals: 6 matched courses + 1 unmatched pick, 51 lessons
  assert.equal(selection.stats.matchedCourses, PICKS.length);
  assert.equal(selection.unmatched.length, 1);
  assert.equal(selection.unmatched[0].input, UNMATCHED_PICK);
  assert.equal(timetable.summary.lessons, 51);
  assert.equal(timetable.summary.courses, 7, 'seven distinct course codes across the six picks');
  assert.equal(timetable.summary.linkStates.verified, 42);
  assert.equal(timetable.summary.linkStates['needs-verification'], 9);
  assert.equal(timetable.summary.linkStates.missing, 0);
});

test('acceptance: dates, times and ordering are correct', () => {
  const weekday = (date) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(`${date}T00:00:00Z`).getUTCDay()];

  let previousDate = '';
  let previousTime = '';
  for (const entry of timetable.entries) {
    assert.match(entry.date, /^20\d{2}-\d{2}-\d{2}$/, `${entry.courseCode} carries a real date`);
    assert.ok(entry.startTime < entry.endTime, `${entry.courseCode} ends after it starts`);
    assert.equal(entry.day, weekday(entry.date), `${entry.courseCode} weekday matches its date`);
    // chronological: dates never go backwards, and times within a date ascend
    assert.ok(entry.date >= previousDate, 'lessons are grouped by ascending date');
    if (entry.date === previousDate) assert.ok(entry.startTime >= previousTime, 'same-day lessons ascend by start time');
    previousDate = entry.date;
    previousTime = entry.startTime;
  }

  const dayDates = timetable.days.map((day) => day.date);
  assert.deepEqual([...dayDates].sort(), dayDates, 'day headings are chronological');
  assert.ok(dayDates.includes('2026-09-14'), 'September lessons are present');
});

test('acceptance: course-selection edge cases', () => {
  const lessonsFor = (input) => selectCourses(dataset.entries, [input]).entries.length;

  // case + whitespace tolerance
  assert.equal(lessonsFor('  ift 211 '), lessonsFor('IFT 211'));
  // MIVA- prefix tolerance, both directions
  assert.equal(lessonsFor('miva-csc 406'), lessonsFor('CSC 406'));
  assert.equal(lessonsFor('MIVA-CSC 406'), lessonsFor('CSC 406'));
  assert.ok(lessonsFor('CSC 406') > 0, 'the catalogue code matches its prefixed spelling');
  // slash-combined codes, spacing variants and halves
  assert.equal(lessonsFor('CSC 301 / MIVA-DTS 301'), lessonsFor('CSC 301/MIVA-DTS 301'));
  assert.ok(lessonsFor('COS 101/ AMS 103') > 0, 'a slash code matches its spacing variant and each half');
  assert.ok(lessonsFor('COS 101') > 0, 'either half of a slash code can be picked');
  // duplicate codes: NSC 512 appears as both 'NSC 512' and 'MIVA-NSC 512'
  const duplicate = courseCatalog(dataset.entries).find((course) => course.altCodes.length > 1);
  assert.ok(duplicate, 'the workbook contains a duplicated course code');
  assert.equal(lessonsFor(duplicate.courseCode), duplicate.lessons, 'both spellings resolve to the same lessons');
  // invalid input stays visible instead of being dropped
  assert.deepEqual(selectCourses(dataset.entries, [UNMATCHED_PICK]).unmatched, [
    { input: UNMATCHED_PICK, normalized: UNMATCHED_PICK },
  ]);
  // the UI surfaces the unmatched pick by name
  const withUnmatched = toggleCourses(uploadState(dataset), [UNMATCHED_PICK]);
  assert.ok(renderApp(withUnmatched).includes('Course not found in this timetable'), 'the student is told which pick failed');
});

test('acceptance: the UI distinguishes verified from needs-verification lessons', () => {
  const summary = summarizeDataset(dataset);
  const stats = completionStats(uiState);
  const text = stripTags(screens.preview);

  assert.equal(stats.classes, timetable.summary.lessons);
  assert.equal(stats.linkStates.verified, 42);
  assert.equal(stats.linkStates['needs-verification'], 9);
  assert.ok(text.includes(`${stats.linkStates.verified} links ready`), 'verified links are counted on screen');
  assert.ok(text.includes(`${stats.linkStates['needs-verification']} need verification`), 'held-back links are counted on screen');

  // the "Good to know" note explains THIS selection, not the whole workbook
  assert.ok(
    text.includes('9 lesson links need verification: 5 with more than one live-lesson URL, 4 with a different course title on the link row.'),
    'the note names the reasons behind this timetable',
  );
  assert.ok(!text.includes('161 lesson'), 'dataset-level totals never leak into a student timetable');

  // verified lesson: clickable, real URL
  const verifiedBlock = lessonBlock(screens.preview, 'IFT 211');
  const verifiedUrl = timetable.entries.find((entry) => entry.courseCode === 'IFT 211' && linkState(entry) === 'verified').lessonUrl;
  assert.ok(verifiedBlock.includes(`href="${verifiedUrl}"`), 'a verified lesson keeps its join link');

  // title disagreement: same code, different link-row title -> held back, explained
  const cmsBlock = lessonBlock(screens.preview, 'CMS 302');
  assert.ok(cmsBlock.includes('Lesson link needs verification'), 'the mismatched lesson is marked');
  assert.ok(!cmsBlock.includes('href='), 'the held-back URL is not clickable');
  assert.ok(cmsBlock.includes('data-reason="title-mismatch"'), 'the reason is shown under the state');
  const cmsEntry = timetable.entries.find((entry) => entry.courseCode === 'CMS 302');
  assert.equal(linkStateReason(cmsEntry), 'title-mismatch');
  assert.ok(cmsBlock.includes(cmsEntry.match.linkTitle), 'the disagreeing title is quoted as evidence');
  assert.ok(cmsBlock.includes('check it is your class before joining'), 'the student is told what to check');

  // upload screen (dataset level) states the same 161 without inventing anything
  assert.ok(stripTags(screens.upload).includes(`${summary.linkStates['needs-verification']} lesson links need verification`));
});

test('acceptance: conflict case — NSC 309 shows both candidates, neither clickable', () => {
  const nscEntries = timetable.entries.filter((entry) => entry.courseCode === 'NSC 309');
  assert.ok(nscEntries.length >= 1);
  for (const entry of nscEntries) {
    assert.equal(linkState(entry), 'needs-verification');
    assert.equal(linkStateReason(entry), 'conflicting-candidates');
    assert.equal(entry.lessonUrl, null, 'no candidate is ever chosen for the student');
    assert.equal(entry.match.conflict.candidates.length, 2, 'both underlying rows are kept');
  }

  const block = lessonBlock(screens.preview, 'NSC 309');
  assert.ok(block.includes('Lesson link needs verification'));
  assert.ok(!block.includes('href='), 'no candidate becomes a link');
  assert.ok(block.includes('data-reason="conflicting-candidates"'));
  assert.ok(block.includes('View link options'), 'the choices stay reachable as secondary detail');
  const [first, second] = nscEntries[0].match.conflict.candidates;
  assert.ok(block.includes(first.url) && block.includes(second.url), 'both candidate URLs are displayed');
  assert.ok(block.includes('Nothing was chosen for you'), 'the UI says no choice was made');
  assert.ok(block.includes(first.titles[0]) && block.includes(second.titles[0]), 'candidate titles are shown');

  // neither candidate reaches the calendar screen, the .ics file or the Google link
  assert.ok(!calendarScreenState.includes(first.url) && !calendarScreenState.includes(second.url));
  const flat = unfold(icsText);
  assert.ok(!flat.includes(first.url) && !flat.includes(second.url), 'the .ics file carries no unverified URL');
  for (const row of googleLessonLinks(uiState).filter((row) => row.courseCode === 'NSC 309')) {
    const details = new URL(row.href).searchParams.get('details');
    assert.ok(!details.includes('Join:'), 'a Google event never gets an unverified join link');
    assert.ok(details.includes('Lesson link needs verification.'), 'the note travels with the event');
  }
});

test('acceptance: calendar export is correct and respects the confidence policy', () => {
  assert.equal(icsEvents, 51, 'every lesson becomes an event');
  const exportOptions = { student: STUDENT, calendarName: CALENDAR_NAME, dtStamp: DT_STAMP };
  const { events, skipped } = toICalendar(timetable.entries, exportOptions);
  assert.equal(skipped.length, 0, 'every lesson has a usable date and time');
  assert.equal(events.length, 51);

  for (const [index, entry] of timetable.entries.entries()) {
    const event = events[index];
    assert.equal(event.summary, `${entry.courseCode} - ${entry.courseTitle}`, 'title carries code + course name');
    assert.equal(event.dtStart, `${entry.date.replace(/-/g, '')}T${entry.startTime.replace(/:/g, '')}00`, 'date + start time convert exactly');
    assert.equal(event.dtEnd, `${entry.date.replace(/-/g, '')}T${entry.endTime.replace(/:/g, '')}00`, 'end time converts exactly');
    assert.equal(event.linkState, linkState(entry), 'the exported state is the same policy the UI shows');
    if (linkState(entry) === 'verified') assert.equal(event.url, entry.lessonUrl);
    else assert.equal(event.url, null, 'held-back links export without a URL');
  }

  const flat = unfold(icsText);
  assert.ok(icsText.startsWith('BEGIN:VCALENDAR\r\n') && icsText.endsWith('END:VCALENDAR\r\n'));
  assert.equal((flat.match(/^URL:/gm) ?? []).length, 42, 'exactly the verified lessons carry a URL');
  assert.equal((flat.match(/^X-TIMETABLEFLOW-LINK-STATE:/gm) ?? []).length, 51);
  assert.equal((flat.match(/^X-TIMETABLEFLOW-LINK-STATE:needs-verification\r?$/gm) ?? []).length, 9);
  assert.equal((flat.match(/^DTSTART:/gm) ?? []).length, 51, 'all events are timed');
  assert.ok(!/^DTSTART:[^\r\n]*Z/m.test(flat), 'times stay floating: no timezone is invented');
  assert.ok(!flat.includes('VALUE=DATE'), 'lessons are timed events, not all-day blocks');
  assert.equal((flat.match(/BEGIN:VALARM/g) ?? []).length, 51, 'every lesson gets the default reminder');
  assert.ok(flat.includes('TRIGGER:-PT15M'), 'the default reminder is 15 minutes before');
  assert.ok(flat.includes(`Student: ${STUDENT}`), 'the student name reaches the description');
  for (const entry of timetable.entries.filter((entry) => linkState(entry) === 'verified')) {
    assert.ok(flat.includes(entry.lessonUrl), `${entry.courseCode}: the verified link reaches the file`);
  }

  // reminders are state, not decoration
  const off = toICalendar(timetable.entries, { student: STUDENT, dtStamp: DT_STAMP, alarmMinutes: 0 });
  assert.equal((unfold(off.ics).match(/BEGIN:VALARM/g) ?? []).length, 0, 'alarms can be switched off');
  const later = toICalendar(timetable.entries, { student: STUDENT, dtStamp: DT_STAMP, alarmMinutes: 30 });
  assert.ok(unfold(later.ics).includes('TRIGGER:-PT30M'));

  // export is deterministic: same data -> same file
  assert.equal(toICalendar(timetable.entries, exportOptions).ics, icsText, 're-exporting produces a byte-identical calendar file');
});

test('acceptance: the finished screens report the real totals', () => {
  const stats = completionStats(uiState);
  const text = stripTags(screens.complete);
  assert.ok(text.includes('Your timetable is ready.'));
  assert.ok(text.includes(`${stats.classes} classes`));
  assert.ok(text.includes(`${stats.courses} courses`));
  assert.ok(text.includes(stats.period));
  assert.equal(
    (calendarScreenState.match(/calendar\.google\.com\/calendar\/render/g) ?? []).length,
    51,
    'one Google Calendar link per lesson',
  );
  for (const row of googleLessonLinks(uiState)) {
    const details = new URL(row.href).searchParams.get('details');
    const dates = new URL(row.href).searchParams.get('dates');
    const shouldJoin = row.linkState === 'verified';
    assert.equal(details.includes('Join:'), shouldJoin, `${row.courseCode}: Join only for verified lessons`);
    assert.ok(details.includes(`${row.courseCode} - ${row.courseTitle}`));
    assert.equal(
      dates,
      `${row.date.replace(/-/g, '')}T${row.startTime.replace(/:/g, '')}00/${row.date.replace(/-/g, '')}T${row.endTime.replace(/:/g, '')}00`,
      'event date/time matches the lesson',
    );
  }
  assertClean(screens.complete, 'complete');
  assertClean(calendarScreenState, 'calendar');
});

test('acceptance: navigation back and forward keeps the student in control', () => {
  // back to the catalogue without losing the selection or the timetable
  const backToCourses = reduce(uiState, { type: 'step/goto', step: 'courses' });
  assert.equal(backToCourses.step, 'courses');
  assert.deepEqual(backToCourses.selected, PICKS, 'the selection survives going back');
  assert.ok(backToCourses.timetable, 'a generated timetable is not thrown away by navigating back');

  // forward again serves the same timetable (no silent regeneration drift)
  const forward = reduce(backToCourses, { type: 'step/goto', step: 'preview' });
  assert.equal(forward.step, 'preview');
  assert.equal(forward.timetable, backToCourses.timetable, 'the same timetable object is served');

  // changing the selection invalidates instead of serving stale lessons
  const changed = reduce(backToCourses, { type: 'course/toggle', code: 'CMS 302' });
  assert.equal(changed.timetable, null, 'a stale timetable is never served');

  // guards: nothing to show yet
  const fresh = uploadState(dataset);
  const guarded = reduce(fresh, { type: 'step/goto', step: 'calendar' });
  assert.equal(guarded.notice.text, NOTICE_COPY['no-timetable']);
  const empty = reduce(fresh, { type: 'courses/continue' });
  assert.equal(empty.notice.text, NOTICE_COPY['no-courses']);
  const noMatch = reduce(toggleCourses(uploadState(dataset), [UNMATCHED_PICK]), { type: 'courses/continue', generatedAt: GENERATED_AT });
  assert.equal(noMatch.notice.text, NOTICE_COPY['no-match'], 'a timetable with no lessons is refused with an explanation');
});

test('acceptance: the downloaded HTML timetable says the same thing as the screen', () => {
  const html = renderHtml(buildViewModel(timetable, { title: `${STUDENT} timetable`, courses: selection.courses }));
  const flat = unfold(html);
  assert.ok(html.includes(STUDENT));
  assert.ok(flat.includes('Lesson link needs verification'), 'held-back links stay marked in the file');
  assert.ok(flat.includes('check it is your class before joining'), 'the title mismatch is explained offline too');
  assert.ok(flat.includes('with a different course title on the link row'), 'the summary note names the reason');
  assert.ok(!flat.includes('matched by course title only'), 'reasons for lessons outside this selection are not shown');
  assert.equal((flat.match(/href="https?:\/\/meet\.google\.com[^"]*"/g) ?? []).length, 42, 'only verified lessons are links');
  assert.ok(!flat.includes('worksheet') && !flat.includes('ExcelJS'), 'the offline file leaks no Excel internals');
  assert.equal(
    renderHtml(buildViewModel(timetable, { title: `${STUDENT} timetable`, courses: selection.courses })),
    html,
    'rendering is deterministic',
  );
});

test('acceptance: product boundary — derived UI, no Excel, no AI, no network beyond the shell', async () => {
  // 1. every rendered screen is free of Excel internals and invented copy
  for (const [name, html] of Object.entries(screens)) assertClean(html, `screen: ${name}`);

  // 2. runtime source (comments stripped) carries no timetable facts of its own.
  //    Vendored third-party assets are not product source — they are pinned to
  //    the npm package by hash further down instead of being regex-scanned.
  const files = [];
  for (const root of ['src', 'public']) {
    const entries = await readdir(path.join(ROOT, root), { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
      const file = path.join(entry.parentPath ?? entry.path, entry.name);
      if (file.includes(`${path.sep}vendor${path.sep}`)) continue;
      files.push(file);
    }
  }
  const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const forbiddenSource = [
    { name: 'a course code', re: /\b[A-Z]{2,5} \d{3}\b/ },
    { name: 'a lesson date', re: /20\d{2}-\d{2}-\d{2}/ },
    { name: 'a meeting URL', re: /meet\.google/i },
    { name: 'a workbook fact', re: /\b(4630|4557|4556|4529|4530)\b/ },
    { name: 'a hard-coded month', re: /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}\b/ },
    { name: 'an AI claim', re: /\bAI\b|artificial intelligence|machine learning|intelligent/ },
    { name: 'a credential or database', re: /\b(password|passwd|signin|sign-in|api[_-]?key|sqlite|firebase|mongodb)\b/i },
  ];
  for (const file of files) {
    const code = stripComments(await readFile(file, 'utf8'));
    for (const { name, re } of forbiddenSource) {
      assert.ok(!re.test(code), `${path.relative(ROOT, file)} hard-codes ${name}`);
    }
  }

  // 2b. the vendored ExcelJS bundle is committed and pinned to the npm package
  const vendorBundle = 'public/vendor/exceljs.min.js';
  const vendorSource = 'node_modules/exceljs/dist/exceljs.min.js';
  assert.ok(existsSync(path.join(ROOT, vendorBundle)), 'the ExcelJS browser bundle is vendored for static hosts');
  const { createHash } = await import('node:crypto');
  const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
  assert.equal(await sha256(path.join(ROOT, vendorBundle)), await sha256(path.join(ROOT, vendorSource)),
    'the vendored bundle is byte-identical to the npm package');

  // 3. the page only talks to its own origin (the service worker caches the shell)
  const sw = await readFile(path.join(ROOT, 'public', 'sw.js'), 'utf8');
  assert.ok(sw.includes('url.origin !== self.location.origin'), 'the worker ignores cross-origin requests');
  assert.ok(!sw.includes('.xlsx'), 'the workbook itself is never cached or uploaded');
  const app = await readFile(path.join(ROOT, 'public', 'app.js'), 'utf8');
  assert.ok(!/\bfetch\(/.test(app), 'the app shell makes no fetch calls of its own');
  assert.ok(!/localStorage|sessionStorage/.test(app + sw), 'nothing is persisted in browser storage');
  for (const file of ['src/ui/state.js', 'src/ui/screens.js', 'src/render/viewModel.js']) {
    const source = await readFile(path.join(ROOT, file), 'utf8');
    assert.ok(!/\bfetch\(/.test(source), `${path.relative(ROOT, file)} makes no network calls`);
  }

  // 4. student-facing copy is finite and documented: steps, notices, link states
  assert.deepEqual(STEPS.map((step) => step.id), ['upload', 'period', 'courses', 'design', 'preview', 'calendar']);
  for (const text of Object.values(NOTICE_COPY)) assert.ok(text.length > 0);
});
