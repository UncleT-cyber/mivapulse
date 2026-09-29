/**
 * Phase 7 — every screen renders honest, data-derived content.
 *
 * These tests are the "no fake UI" guard: numbers come from the dataset, link
 * states survive to the screen, unmatched courses are surfaced, and nothing
 * invented (TBA / Unknown lecturer / placeholder stats) ever appears.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { loadWorkbook, processWorkbook } from '../src/index.js';
import { initialState, reduce, NOTICE_COPY } from '../src/ui/state.js';
import { renderApp } from '../src/ui/screens.js';
import { formatDate } from '../src/render/html.js';
import { datasetBounds } from '../src/student/period.js';
import { PARSE_ERRORS } from '../src/app/messages.js';
import { buildFixtureBuffer } from './helpers/fixtureWorkbook.js';
import {
  calendarState,
  designState,
  lessonBlock,
  periodScreen,
  previewState,
  selectCourses,
  uploadState,
} from './helpers/uiFlow.js';
import { stripTags } from './helpers/uiFlow.js';

const dataset = processWorkbook(await loadWorkbook(await buildFixtureBuffer()));
const FIXTURE_ENTRY_COUNT = 18;

const FORBIDDEN_COPY = [
  'Unknown Lecturer',
  'Unknown Topic',
  'TBA',
  'Lorem ipsum',
  'placeholder content',
];
const FORBIDDEN_INTERNALS = ['worksheet', 'ExcelJS', 'rawCellText', 'sourceSheet', 'sourceCell', 'HYPERLINK('];
const WORKBOOK_NUMBERS = ['464', '4556', '4529', '4557']; // real-workbook facts never appear in the UI

function assertClean(html, label) {
  for (const copy of FORBIDDEN_COPY) {
    assert.ok(!html.includes(copy), `${label} shows invented copy "${copy}"`);
  }
  for (const internal of FORBIDDEN_INTERNALS) {
    assert.ok(!html.includes(internal), `${label} leaks Excel internals "${internal}"`);
  }
  for (const number of WORKBOOK_NUMBERS) {
    assert.ok(!html.includes(number), `${label} hard-codes workbook fact "${number}"`);
  }
}

test('screen 1 — upload: value proposition, drop zone and file picker', () => {
  const html = renderApp(initialState());
  assert.ok(html.includes('Build your MIVA timetable'));
  assert.ok(html.includes('select the courses you'));
  assert.ok(html.includes('Drop your .xlsx here'));
  assert.ok(html.includes('<label for="tf-file"'), 'the picker has an accessible label');
  assert.ok(html.includes('type="file"'), 'drag and drop always has a file-picker alternative');
  assert.ok(html.includes('nothing is uploaded anywhere'));
  assert.ok(html.includes('aria-label="Progress"'), 'a progress indicator is present');
  assert.equal(html.includes('lessons</strong>'), false, 'no stats before anything was parsed');
  assertClean(html, 'upload (idle)');
});

test('screen 1 — parsing shows honest stages, not fake percentages', () => {
  let state = reduce(initialState(), { type: 'upload/started', filename: 'MIVA Master.xlsx' });
  let html = renderApp(state);
  assert.ok(html.includes('Processing your timetable'));
  assert.ok(html.includes('Reading timetable…'));
  assert.ok(!/\d+%/.test(html), 'no progress percentage is invented');

  state = reduce(state, { type: 'upload/stage', stage: { id: 'links', label: 'Resolving lesson links…' } });
  html = renderApp(state);
  assert.ok(html.includes('Reading timetable…'), 'earlier stages remain visible as done');
  assert.ok(html.includes('Resolving lesson links…'));
  assertClean(html, 'upload (parsing)');
});

test('screen 1 — success state reports facts from the parsed dataset', () => {
  const loaded = reduce(reduce(initialState(), { type: 'upload/started', filename: 'MIVA Master.xlsx' }), {
    type: 'upload/succeeded',
    dataset,
  });
  const html = renderApp(loaded);
  const text = stripTags(html);
  assert.ok(html.includes('Timetable loaded'));
  assert.ok(html.includes('MIVA Master.xlsx'));
  assert.ok(text.includes(`${FIXTURE_ENTRY_COUNT} lessons`), 'lesson count is derived');
  assert.ok(text.includes('17 courses'), 'course count is derived');
  assert.ok(text.includes('September 2026'), 'period is derived from entry dates');
  assert.ok(text.includes('2 lesson links need verification'));
  assert.ok(text.includes('2 lessons without a live-lesson link'));
  assert.ok(!text.includes('All lesson links resolved'), 'only claimed when it is true');
  assert.ok(html.includes('Choose your period'));
  assertClean(html, 'upload (loaded)');
});

test('screen 1 — every failure mode has its own message', () => {
  for (const [kind, copy] of Object.entries(PARSE_ERRORS)) {
    const state = reduce(initialState(), { type: 'upload/failed', kind });
    const html = renderApp(state);
    const escaped = copy.message.replace(/'/g, '&#39;');
    assert.ok(html.includes(escaped), `${kind} shows its copy`);
    assert.ok(html.includes('role="alert"'), 'errors are announced');
    assert.ok(html.includes('type="file"'), 'the student can try again with another file');
    assertClean(html, `upload (error: ${kind})`);
  }
});

test('screen 1.5 — period: the student chooses which part of the workbook to use', () => {
  const state = periodScreen(dataset);
  assert.equal(state.step, 'period');
  assert.equal(state.period, null, 'no period is pre-selected for the student');

  const html = renderApp(state);
  const text = stripTags(html);
  const bounds = datasetBounds(dataset.entries);
  assert.ok(html.includes('Choose your period'));
  assert.ok(text.includes(`This timetable contains lessons from ${formatDate(bounds.firstDate)} to ${formatDate(bounds.lastDate)}`),
    'the lead states the real bounds of the uploaded timetable');
  assert.ok(html.includes('data-action="period/select" data-id="2026-09"'), 'the month comes from the parsed dates');
  assert.ok(text.includes('September 2026'), 'the month label is derived');
  assert.ok(text.includes('18 lessons · 17 courses'), 'period option numbers come from the dataset');
  assert.ok(html.includes('All available dates'), 'the explicit "all" option exists');
  assert.ok(html.includes('type="date"') && html.includes('data-action="period/from"'), 'a custom range is offered');
  assert.ok(!/data-action="period\/select"[^>]*aria-pressed="true"/.test(html), 'nothing is selected yet');
  assertClean(html, 'period');

  const refused = reduce(state, { type: 'period/continue' });
  assert.equal(refused.notice.text, NOTICE_COPY['no-period'], 'continuing without a period is refused');

  const chosen = reduce(state, { type: 'period/select', id: '2026-09' });
  const chosenText = stripTags(renderApp(chosen));
  assert.ok(chosenText.includes('18 lessons'), 'the summary uses the projection, not a hard-coded number');
  assert.ok(chosen.periodDataset.entries.length === 18, 'the projection holds the month lessons');
  assert.equal(chosen.dataset.entries.length, 18, 'the full dataset stays intact');
  assert.equal(chosen.step, 'period', 'the student sees the new summary before moving on');
});

test('screen 2 — selection shows the selected count and every unmatched course', () => {
  const state = selectCourses(uploadState(dataset), ['IFT 211', 'NSC 309', 'NOPE 999']);
  const html = renderApp(state);

  assert.ok(html.includes('Select your courses'));
  assert.ok(html.includes('3 courses selected'), 'the count is derived from state');
  assert.ok(html.includes('data-code="IFT 211"'));
  assert.ok(html.includes('data-code="NSC 309"'));
  assert.ok(html.includes('Not in this timetable'));
  assert.ok(html.includes('NOPE 999'));
  assert.ok(html.includes('Course not found in this timetable'), 'unmatched picks are never hidden');
  assert.ok(html.includes('Nothing was removed'));
  assert.ok(html.includes('matched'), 'the student sees how many lessons matched');
  assertClean(html, 'courses');
});

test('screen 2 — search filters by code and by title', () => {
  const byCode = renderApp(reduce(uploadState(dataset), { type: 'search/set', value: 'ift' }));
  assert.ok(byCode.includes('data-code="IFT 211"'));
  assert.ok(byCode.includes('data-code="IFT 410"'));
  assert.ok(!byCode.includes('data-code="NSC 512"'));

  const byTitle = renderApp(reduce(uploadState(dataset), { type: 'search/set', value: 'broadcasting' }));
  assert.ok(byTitle.includes('data-code="MCM 101"'));

  const nothing = renderApp(reduce(uploadState(dataset), { type: 'search/set', value: 'zzzz' }));
  assert.ok(nothing.includes('No courses match “zzzz”.'));
  assert.ok(nothing.includes('0 courses found'));

  assertClean(nothing, 'courses (empty search)');
});

test('screen 2 — the catalogue lists real courses with their lesson counts', () => {
  const html = renderApp(uploadState(dataset));
  assert.ok(html.includes('data-code="MCM 101"'));
  assert.ok(html.includes('2 lessons'), 'per-course lesson counts are derived');
  assert.ok(html.includes('Foundations of Broadcasting and Film'));
  assert.ok(html.includes('courses found'));
  assertClean(html, 'courses (catalogue)');
});

test('screen 3 — every template is offered and the selected one is marked', () => {
  const html = renderApp(designState(dataset, ['IFT 211', 'NSC 309', 'CSC 101', 'MCM 101']));
  assert.ok(html.includes('Choose a template'));
  for (const name of ['Minimal', 'Color Pop', 'Glass', 'Dark', 'Focus', 'Mobile Timeline']) {
    assert.ok(html.includes(name), `template ${name} is offered`);
  }
  assert.ok(html.includes('aria-pressed="true"'));
  assert.ok(html.includes('uses your own lessons'), 'previews are explained as real data');
  assert.ok(html.includes('Previewing'), 'the preview window is stated');
  assert.ok(html.includes('IFT 211'), 'the preview shows the student lessons, not samples');
  assertClean(html, 'design');
});

test('screen 4 — timetable shows every field the dataset actually has', () => {
  const html = renderApp(previewState(dataset, ['IFT 211', 'NSC 309', 'CSC 101']));
  assert.ok(html.includes('Your timetable'));
  assert.ok(html.includes('Monday, 14 Sep 2026'), 'day + date');
  assert.ok(html.includes('15:00'), 'start time');
  assert.ok(html.includes('Digital Logic Design'), 'course title');
  assert.ok(html.includes('Nursing Ethics and Jurisprudence'));
  assert.ok(html.includes('tf-stat'), 'summary stats');
  assert.ok(html.includes('Confirm timetable'));
  assert.ok(html.includes('for="tf-student"'), 'optional name field is labelled');
  assertClean(html, 'preview');
});

test('screen 4 — verified, needs-verification and missing links are distinct', () => {
  const html = renderApp(previewState(dataset, ['IFT 211', 'NSC 309', 'ECO 306']));

  const verified = lessonBlock(html, 'IFT 211');
  assert.ok(verified.includes('<a '), 'verified lessons are clickable');
  assert.ok(verified.includes('href="https://meet.google.com/aaa-bbbb-ccc"'));
  assert.ok(verified.includes('Join live lesson'));

  const pending = lessonBlock(html, 'NSC 309');
  assert.ok(pending.includes('Lesson link needs verification'));
  assert.ok(!pending.includes('<a '), 'an ambiguous link is never presented as a join button');
  assert.ok(!pending.includes('href='), 'no URL is exposed as if it were resolved');
  assert.ok(pending.includes('<details'), 'candidates are available as secondary detail');
  assert.ok(pending.includes('conflict-a-001'));

  const missing = lessonBlock(html, 'ECO 306');
  assert.ok(missing.includes('Live lesson link unavailable'));
  assert.ok(!missing.includes('<a '), 'a missing link is never fabricated');
  assert.ok(!missing.includes('http'));

  assert.ok(html.includes('Good to know'), 'link notes are surfaced');
  assertClean(html, 'preview (link states)');
});

test('screen 4 — schedule conflicts are reported, never silently resolved', () => {
  // IFT 211 and IFT 410 sit in the same slot column on the same day
  const html = renderApp(previewState(dataset, ['IFT 211', 'IFT 410']));
  const text = stripTags(html);
  assert.ok(text.includes('Schedule conflict'));
  assert.ok(text.includes('IFT 211'));
  assert.ok(text.includes('IFT 410'));
  assert.ok(text.includes('overlap'), 'the conflict explains itself');
  assert.ok(text.includes('decide which one you will attend'));
  assert.ok(text.includes('schedule conflicts'), 'the conflict count is in the stats');
  assertClean(html, 'preview (conflicts)');
});

test('screen 5 — calendar flow explains exactly what the student gets', () => {
  const state = calendarState(dataset, ['IFT 211', 'NSC 309', 'CSC 101']);
  const html = renderApp(state);
  assert.ok(html.includes('Your timetable is ready.'));
  assert.ok(html.includes('Add your classes to your calendar?'));
  assert.ok(html.includes('Download calendar'));
  assert.ok(html.includes('Google Calendar'));
  assert.ok(html.includes('Apple Calendar'));
  assert.ok(html.includes('Outlook'));
  assert.ok(html.includes('.ics'));
  const text = stripTags(html);
  assert.ok(text.includes('3 classes'), 'numbers come from the timetable');
  assert.ok(text.includes('3 courses'));
  assert.ok(text.includes('September 2026'));
  assert.ok(!html.includes('connected to your account'), 'no integration that does not exist');

  // reminders + per-lesson Google Calendar links
  assert.ok(html.includes('name="tf-reminder"'), 'the reminder control is offered');
  assert.match(html, /id="tf-rem-15"[^>]*checked/, '15 minutes is the default');
  assert.ok(html.includes('15 minutes before it starts'), 'the default is explained');
  assert.ok(html.includes('Remind me before each lesson'));
  const links = (html.match(/calendar\.google\.com\/calendar\/render/g) ?? []).length;
  assert.equal(links, 3, 'one Google Calendar link per lesson');
  assert.ok(html.includes('Add to Google Calendar'));
  assert.ok(html.includes('no file needed on a phone'));
  assert.ok(!html.includes('conflict-a'), 'candidate URLs never reach the screen');
  assertClean(html, 'calendar');
});

test('screen 5 — the reminder choice switches the alarm in the file', () => {
  const dtStamp = '2026-09-01T10:00:00.000Z';
  let state = calendarState(dataset, ['IFT 211', 'NSC 309', 'CSC 101']);
  state = reduce(state, { type: 'calendar/prepare', dtStamp });
  assert.ok(state.calendar.ics.includes('TRIGGER:-PT15M'));

  state = reduce(state, { type: 'calendar/reminder/set', minutes: 30 });
  const html = renderApp(state);
  assert.match(html, /id="tf-rem-30"[^>]*checked/);
  assert.ok(html.includes('30 minutes before it starts'));
  assert.equal(state.calendar.status, 'idle', 'the old file is discarded');

  state = reduce(state, { type: 'calendar/prepare', dtStamp });
  assert.ok(state.calendar.ics.includes('TRIGGER:-PT30M'));

  state = reduce(state, { type: 'calendar/reminder-set', minutes: 0 });
  assert.equal(state.reminderMinutes, 30, 'unknown action shapes are ignored');
  assertClean(html, 'calendar (reminder changed)');
});

test('screen 5 — a failed export keeps the timetable and offers a retry', () => {
  let state = calendarState(dataset, ['IFT 211']);
  state = reduce(state, { type: 'calendar/failed', message: 'the file could not be saved.' });
  const html = renderApp(state);
  assert.ok(html.includes('Calendar export failed'));
  assert.ok(html.includes('try again'));
  assert.ok(html.includes('Try export again'));
  assert.ok(html.includes('Your timetable'), 'the student keeps their timetable');
  assert.equal(state.timetable, state.selection && state.timetable, 'the generated timetable is intact');
  assert.ok(state.timetable.summary.lessons > 0, 'lessons are still available to export again');
  assertClean(html, 'calendar (failed)');
});

test('screen 6 — completion shows the real totals of the finished timetable', () => {
  let state = calendarState(dataset, ['IFT 211', 'NSC 309', 'CSC 101', 'MCM 101']);
  state = reduce(state, { type: 'calendar/prepare', dtStamp: '2026-09-01T10:00:00.000Z' });
  state = reduce(state, { type: 'calendar/exported' });
  const html = renderApp(state);

  assert.equal(state.step, 'complete');
  const text = stripTags(html);
  assert.ok(html.includes('Your timetable is ready.'));
  assert.ok(text.includes(`${state.timetable.summary.lessons} classes`));
  assert.ok(text.includes(`${state.timetable.summary.courses} courses`));
  assert.ok(text.includes('September 2026'));
  assert.ok(html.includes('View timetable'));
  assert.ok(html.includes('Download calendar again'));
  assert.ok(text.includes('need verification'), 'link states survive to the end');
  assertClean(html, 'complete');
});

test('every screen stays free of Excel internals and placeholder copy', () => {
  const states = [
    initialState(),
    periodScreen(dataset),
    uploadState(dataset),
    selectCourses(uploadState(dataset), ['IFT 211']),
    designState(dataset, ['IFT 211', 'SEN 306']),
    previewState(dataset, ['IFT 211', 'NSC 309', 'ECO 306']),
    calendarState(dataset, ['IFT 211']),
  ];
  for (const state of states) {
    assertClean(renderApp(state), `step ${state.step}`);
  }
});
