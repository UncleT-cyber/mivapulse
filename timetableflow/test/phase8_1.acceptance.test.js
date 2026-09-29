/**
 * Phase 8.1 — period selection acceptance: the student-facing workflow.
 *
 * What this proves, against synthetic data (months the real workbook does not
 * contain) and against the real reference workbook:
 *
 *   - upload -> PERIOD -> courses -> design -> preview -> calendar -> complete
 *   - course selection, preview, conflicts, HTML and ICS all operate on the
 *     PERIOD projection, never on the full workbook
 *   - the period can be changed without re-parsing or re-uploading, and no
 *     stale lesson from the previous period survives
 *   - a second workbook resets everything derived from the first one
 *   - link confidence is untouched by filtering (same entry objects, same
 *     verified / needs-verification / missing verdicts)
 *   - nothing is hard-coded to any particular month or year
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadWorkbook, processWorkbook } from '../src/index.js';
import { REFERENCE_WORKBOOK } from '../scripts/validate-real-workbook.js';
import { courseCatalog, selectCourses } from '../src/student/selection.js';
import { linkState } from '../src/student/timetable.js';
import {
  allPeriod,
  isProvisionalPeriod,
  periodById,
  periodOptions,
  projectDataset,
  sourceMonthFromDataset,
} from '../src/student/period.js';
import { initialState, reduce, STEPS, NOTICE_COPY } from '../src/ui/state.js';
import { renderApp } from '../src/ui/screens.js';
import { courseOptions, periodChoices, periodSummary, summarizeDataset } from '../src/ui/selectors.js';
import { makeEntry } from './helpers/entryFactory.js';
import { choosePeriod, periodScreen, selectCourses as toggleCourses, generate, stripTags } from './helpers/uiFlow.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED_AT = '2044-07-01T10:00:00.000Z';
const DT_STAMP = '2044-07-01T10:00:00.000Z';

/** A dataset as the UI receives it: entries + workbook metadata. */
function datasetOf(entries, sheetName) {
  return { entries, sheets: { parsed: [{ name: sheetName }] }, stats: {}, warnings: [] };
}

/** Lessons for a month, with one verified, one ambiguous and one link-less course. */
function lessonsOf(monthKey, { verifiedCode, conflictedCode, missingCode }) {
  const day = (n) => ['Monday', 'Tuesday', 'Wednesday', 'Thursday'][(n - 1) % 4];
  const rows = [
    makeEntry({ courseCode: verifiedCode, date: `${monthKey}-05`, day: day(1), startTime: '09:00', endTime: '10:00' }),
    makeEntry({
      courseCode: conflictedCode,
      date: `${monthKey}-06`,
      day: day(2),
      startTime: '10:00',
      endTime: '11:00',
      lessonUrl: null,
      match: {
        tier: 'code',
        rule: 'exact-course-code',
        ambiguous: true,
        titleMismatch: false,
        linkTitle: conflictedCode,
        candidates: [
          { url: 'https://meet.google.com/aaa-1111-ccc', linkTitle: 'One title' },
          { url: 'https://meet.google.com/bbb-2222-ddd', linkTitle: 'Another title' },
        ],
        conflict: { reason: 'two different URLs' },
      },
    }),
    makeEntry({
      courseCode: missingCode,
      date: `${monthKey}-07`,
      day: day(3),
      startTime: '11:00',
      endTime: '12:00',
      lessonUrl: null,
      match: { tier: 'none', rule: 'no-match', ambiguous: false, titleMismatch: false, linkTitle: null, candidates: [], conflict: null },
    }),
  ];
  return rows;
}

function uploadedWith(dataset) {
  let state = initialState();
  state = reduce(state, { type: 'upload/started', filename: 'Synthetic MIVA.xlsx' });
  return reduce(state, { type: 'upload/succeeded', dataset });
}

test('workflow: upload -> period -> courses, and the catalogue comes from the period', () => {
  const july = lessonsOf('2044-07', { verifiedCode: 'SUM 101', conflictedCode: 'SUM 102', missingCode: 'SUM 103' });
  const august = lessonsOf('2044-08', { verifiedCode: 'LATE 201', conflictedCode: 'LATE 202', missingCode: 'LATE 203' });
  const dataset = datasetOf([...july, ...august], 'July 2044 Live Lesson Time');

  const state = periodScreen(dataset);
  assert.equal(state.step, 'period');
  assert.equal(state.period, null, 'the app never pre-selects a period');
  assert.deepEqual(
    periodChoices(dataset).map((choice) => [choice.id, choice.label, choice.lessons]),
    [['2044-07', 'July 2044', 3], ['2044-08', 'August 2044', 3], ['all', 'All available dates', 6]],
    'period options are derived from the parsed lessons',
  );

  const refused = reduce(state, { type: 'period/continue' });
  assert.equal(refused.notice.text, NOTICE_COPY['no-period'], 'a period must be chosen explicitly');

  const onJuly = choosePeriod(state, '2044-07');
  assert.equal(onJuly.step, 'period');
  assert.equal(periodSummary(onJuly).label, 'July 2044');
  assert.equal(periodSummary(onJuly).lessons, 3, 'the summary counts the projection');
  assert.equal(onJuly.dataset.entries.length, 6, 'the full workbook keeps every lesson');

  const onCourses = reduce(onJuly, { type: 'period/continue' });
  assert.equal(onCourses.step, 'courses');
  assert.deepEqual(courseOptions(onCourses.periodDataset).map((course) => course.courseCode).sort(),
    ['SUM 101', 'SUM 102', 'SUM 103'], 'the catalogue lists only courses with lessons in the period');

  const html = renderApp(onCourses);
  assert.ok(html.includes('data-code="SUM 101"'));
  assert.ok(!html.includes('data-code="LATE 201"'), 'a course without lessons in the period is not offered');
  assert.ok(html.includes('Course list for'), 'the screen states which period the list is for');
  assert.ok(stripTags(html).includes('July 2044'), 'and names it');
});

test('period switching: recompute without re-parsing, never serve stale lessons', () => {
  const july = lessonsOf('2044-07', { verifiedCode: 'SUM 101', conflictedCode: 'SUM 102', missingCode: 'SUM 103' });
  const august = lessonsOf('2044-08', { verifiedCode: 'SUM 101', conflictedCode: 'LATE 202', missingCode: 'LATE 203' });
  const dataset = datasetOf([...july, ...august], 'July 2044 Live Lesson Time');

  let state = periodScreen(dataset);
  state = choosePeriod(state, '2044-07');
  state = reduce(state, { type: 'period/continue' });
  state = toggleCourses(state, ['SUM 101', 'SUM 103']);
  state = generate(state, GENERATED_AT);
  assert.equal(state.step, 'design');
  assert.equal(state.timetable.summary.lessons, 2, 'the July projection is what was generated');
  const uploadedDataset = state.dataset;

  // change the period — same workbook, no second parse, no second upload
  state = reduce(state, { type: 'step/goto', step: 'period' });
  state = choosePeriod(state, '2044-08');
  assert.equal(state.step, 'period');
  assert.equal(state.dataset, uploadedDataset, 'the parsed dataset object is reused — no reparse');
  assert.equal(state.timetable, null, 'the timetable built for July is never served for August');
  assert.equal(state.viewModel, null);
  assert.deepEqual(state.selected, ['SUM 101', 'SUM 103'], 'course picks survive the period change');
  assert.equal(state.periodDataset.entries.length, 3, 'a fresh August projection');
  assert.equal(periodSummary(state).label, 'August 2044');

  state = generate(state, GENERATED_AT);
  assert.equal(state.timetable.summary.lessons, 1, 'only SUM 101 has an August lesson');
  assert.deepEqual(state.selection.unmatched.map((item) => item.normalized), ['SUM 103'],
    'the July-only course is surfaced instead of hidden');

  state = reduce(state, { type: 'step/goto', step: 'preview' });
  const preview = renderApp(state);
  assert.ok(preview.includes('data-week="2044-08-'), 'the August lesson is there');
  assert.ok(!preview.includes('2044-07-'), 'no July lesson leaks into the August timetable');
  assert.ok(stripTags(preview).includes('Timetable for August 2044'), 'the period is stated on screen');

  state = reduce(state, { type: 'preview/confirm' });
  state = reduce(state, { type: 'calendar/prepare', dtStamp: DT_STAMP });
  const starts = [...state.calendar.ics.matchAll(/DTSTART:(\d{4})(\d{2})\d{2}T/g)].map((m) => `${m[1]}-${m[2]}`);
  assert.equal(state.calendar.events, 1, 'the calendar file holds only the projected period');
  assert.deepEqual([...new Set(starts)], ['2044-08'], 'every exported event is in the chosen period');
  assert.equal(state.calendar.ics.split('URL:').length - 1, 1, 'the verified lesson exports its URL');

  // back to a range that covers both months (inside the timetable's own bounds)
  state = reduce(state, { type: 'step/goto', step: 'period' });
  state = reduce(state, { type: 'period/range/set', field: 'from', value: '2044-07-05' });
  state = reduce(state, { type: 'period/range/set', field: 'to', value: '2044-08-07' });
  state = reduce(state, { type: 'period/range/apply' });
  assert.equal(state.period.type, 'custom');
  assert.equal(state.periodDataset.entries.length, 6, 'the custom range covers both months');
  assert.equal(state.timetable, null, 'a new period invalidates the generated timetable');

  const outOfOrder = reduce(state, { type: 'period/range/set', field: 'from', value: '2044-07-01' });
  const bad = reduce(outOfOrder, { type: 'period/range/apply' });
  assert.equal(bad.notice.text, NOTICE_COPY['range-outside'], 'dates outside the timetable are refused');
  assert.equal(bad.period.type, 'custom', 'the previous period stays in place');
  assert.equal(bad.periodDataset.entries.length, 6, 'and so does its projection');
});

test('reset: a second workbook leaves nothing of the first one behind', () => {
  const july = lessonsOf('2044-07', { verifiedCode: 'SUM 101', conflictedCode: 'SUM 102', missingCode: 'SUM 103' });
  const workbookA = datasetOf(july, 'July 2044 Live Lesson Time');
  const january = [
    makeEntry({ courseCode: 'NEW 401', date: '2045-01-15', day: 'Monday' }),
    makeEntry({ courseCode: 'NEW 402', date: '2045-01-16', day: 'Tuesday' }),
  ];
  const workbookB = datasetOf(january, 'January 2045 Live Lesson Time');

  let state = uploadedWith(workbookA);
  state = choosePeriod(state, '2044-07');
  state = reduce(state, { type: 'period/continue' });
  state = toggleCourses(state, ['SUM 101']);
  state = generate(state, GENERATED_AT);
  state = reduce(state, { type: 'preview/confirm' });
  state = reduce(state, { type: 'calendar/prepare', dtStamp: DT_STAMP });
  assert.equal(state.calendar.status, 'ready');
  const template = state.template;

  // the student receives next month's file and starts over
  state = reduce(state, { type: 'upload/started', filename: 'January 2045.xlsx' });
  assert.equal(state.dataset, null, 'the old workbook is dropped as soon as a new one starts');
  assert.equal(state.period, null);
  assert.equal(state.periodDataset, null);
  assert.deepEqual(state.selected, []);
  assert.equal(state.timetable, null);
  assert.equal(state.calendar.status, 'idle');

  state = reduce(state, { type: 'upload/succeeded', dataset: workbookB });
  assert.equal(state.dataset, workbookB, 'the new workbook is the only source of truth');
  assert.equal(state.period, null, 'the period is chosen again for the new file');
  assert.equal(state.step, 'upload');
  assert.equal(state.template, template, 'the visual template preference is deliberately preserved');
  assert.deepEqual(
    periodChoices(state.dataset).map((choice) => choice.label),
    ['January 2045', 'All available dates'],
    'periods are regenerated from the new workbook only',
  );

  const onPeriod = reduce(state, { type: 'upload/continue' });
  const html = renderApp(onPeriod);
  assert.ok(!html.includes('2044'), 'no lesson, month or period from the old workbook is shown');
  assert.ok(html.includes('January 2045'));
});

test('confidence policy is untouched by the period filter', () => {
  const july = lessonsOf('2044-07', { verifiedCode: 'SUM 101', conflictedCode: 'SUM 102', missingCode: 'SUM 103' });
  const august = lessonsOf('2044-08', { verifiedCode: 'SUM 101', conflictedCode: 'SUM 102', missingCode: 'SUM 103' });
  const dataset = datasetOf([...july, ...august], 'July 2044 Live Lesson Time');

  const before = july.map((entry) => linkState(entry));
  assert.deepEqual(before, ['verified', 'needs-verification', 'missing']);

  const projected = projectDataset(dataset, periodByIdFrom(dataset, '2044-07'));
  const after = projected.entries.map((entry) => linkState(entry));
  assert.deepEqual(after, before, 'filtering selects entries; it never re-resolves a URL');
  for (const entry of projected.entries) {
    assert.ok(dataset.entries.includes(entry), 'the projection reuses the very same entry objects');
  }
  assert.equal(projected.entries[0].lessonUrl, july[0].lessonUrl, 'a verified URL is carried through unchanged');
  assert.equal(projected.entries[1].lessonUrl, null, 'an ambiguous entry never gains a URL');
});

test('the student flow stays inside the documented steps and notices', () => {
  assert.deepEqual(STEPS.map((step) => step.id), ['upload', 'period', 'courses', 'design', 'preview', 'calendar']);
  for (const key of ['no-period', 'empty-period', 'range-missing', 'range-invalid', 'range-order', 'range-outside']) {
    assert.equal(typeof NOTICE_COPY[key], 'string', `${key} has copy`);
    assert.ok(NOTICE_COPY[key].length > 0, `${key} is not empty`);
  }
});

test('real workbook: periods are discovered, filtered and switchable', async () => {
  const dataset = processWorkbook(await loadWorkbook(await readFile(REFERENCE_WORKBOOK)));
  assert.equal(dataset.entries.length, 4557, 'the full workbook still holds every lesson');

  // 1. period options discovered from the data
  const options = periodOptions(dataset.entries);
  assert.equal(options.length, 13, 'every month present in the workbook, plus "all" below');
  assert.equal(options[0].label, 'November 2024', 'derived, oldest first');
  assert.equal(options.at(-1).label, 'November 2026');
  assert.equal(allPeriod(dataset.entries).lessons, 4557);

  // 2. filtering is exact
  const september = projectDataset(dataset, periodByIdFrom(dataset, '2026-09'));
  const november = projectDataset(dataset, periodByIdFrom(dataset, '2026-11'));
  assert.equal(september.entries.length, 464, 'September 2026 projection');
  assert.equal(november.entries.length, 542, 'November 2026 projection');
  assert.equal(dataset.entries.length, 4557, 'the full dataset is untouched');
  assert.ok(september.entries.every((entry) => entry.date.startsWith('2026-09')));

  // 3. the catalogue follows the period
  assert.equal(courseOptions(september).length, 462, 'courses with a September lesson');
  assert.equal(courseOptions(november).length, 540, 'courses with a November lesson');
  assert.ok(courseOptions(november).length < summarizeDataset(dataset).courses, 'a period narrows the catalogue');

  // 4. provenance: the leading month sheet says what the workbook is for
  const source = sourceMonthFromDataset(dataset);
  assert.equal(source.id, '2026-09', 'the leading month sheet of the reference workbook');
  assert.equal(isProvisionalPeriod(allPeriod(dataset.entries), source), true, 'the whole span reaches past it');
  assert.equal(isProvisionalPeriod(periodByIdFrom(dataset, '2026-11'), source), true, 'a later month is provisional');
  assert.equal(isProvisionalPeriod(periodByIdFrom(dataset, '2026-09'), source), false, 'the workbook month is not');
  assert.equal(isProvisionalPeriod(periodByIdFrom(dataset, '2025-10'), source), false, 'earlier months are not');

  // 5. the whole UI flow on the real workbook, switching periods once
  let state = periodScreen(dataset);
  state = choosePeriod(state, '2026-09');
  state = reduce(state, { type: 'period/continue' });
  const picked = ['IFT 211', 'CSC 406', 'CMS 302']
    .filter((code) => courseCatalog(state.periodDataset.entries).some((course) => course.courseCode === code));
  assert.ok(picked.length > 0, 'the sample courses exist in the September catalogue');
  const septemberProjection = state.periodDataset;
  const expectedSeptember = selectCourses(septemberProjection.entries, picked).stats.lessons;
  state = toggleCourses(state, picked);
  state = generate(state, '2026-09-01T10:00:00.000Z');
  const septemberLessons = state.timetable.summary.lessons;
  assert.equal(septemberLessons, expectedSeptember, 'the timetable is generated from the September projection');
  assert.ok(septemberLessons > 0, 'the picked courses have September lessons');
  assert.ok(
    stripTags(renderApp(state)).includes('September 2026'),
    'the period is on the screen',
  );

  state = reduce(state, { type: 'step/goto', step: 'period' });
  state = choosePeriod(state, '2026-11');
  assert.equal(state.timetable, null, 'switching invalidates the generated timetable');
  assert.notEqual(state.periodDataset, septemberProjection, 'a fresh projection for the new period');
  assert.notEqual(state.periodDataset.entries.length, septemberProjection.entries.length,
    'the two periods contain different numbers of lessons');
  const expectedNovember = selectCourses(state.periodDataset.entries, picked).stats.lessons;
  state = generate(state, '2026-11-01T10:00:00.000Z');
  const novemberLessons = state.timetable.summary.lessons;
  assert.equal(novemberLessons, expectedNovember, 'the timetable is regenerated from the November projection');
  assert.ok(novemberLessons > 0, 'the same picks have November lessons too');
  assert.ok(state.timetable.days.every((day) => day.date.startsWith('2026-11')),
    'every rendered day belongs to the chosen period only');

  state = reduce(state, { type: 'step/goto', step: 'preview' });
  const preview = renderApp(state);
  assert.ok(!preview.includes('data-week="2026-09-'), 'no September lesson survives the switch to November');
  assert.ok(preview.includes('data-week="2026-11-'), 'the November lessons are rendered');

  // 6. the future-period notice follows the data, not the clock
  assert.ok(renderApp(state).includes('Future timetable information'), 'November 2026 is past the workbook month');
  state = reduce(state, { type: 'step/goto', step: 'period' });
  state = choosePeriod(state, '2026-09');
  assert.ok(!renderApp(state).includes('Future timetable information'), 'the workbook month itself needs no warning');
});

/** periodById bound to a dataset (small helper so the tests read plainly). */
function periodByIdFrom(dataset, id) {
  return periodById(dataset.entries, id);
}

test('the HTML download is a standalone page with clickable verified links', () => {
  const july = [
    ...lessonsOf('2044-07', { verifiedCode: 'SUM 101', conflictedCode: 'SUM 102', missingCode: 'SUM 103' }),
    // a held-back lesson that still carries a URL (title mismatch) — the case
    // that must never become a clickable link in the download
    makeEntry({
      courseCode: 'SUM 104',
      date: '2044-07-08',
      day: 'Thursday',
      startTime: '09:00',
      endTime: '10:00',
      lessonUrl: 'https://meet.google.com/held-back-url',
      match: { tier: 'title', rule: 'title-mismatch', ambiguous: false, titleMismatch: true, linkTitle: 'A different title', candidates: [], conflict: null },
    }),
  ];
  const dataset = datasetOf(july, 'July 2044 Live Lesson Time');
  let state = periodScreen(dataset);
  state = reduce(state, { type: 'student/set', value: 'Ada Lovelace' });
  state = choosePeriod(state, '2044-07');
  state = reduce(state, { type: 'period/continue' });
  state = toggleCourses(state, ['SUM 101', 'SUM 102', 'SUM 104']);
  state = generate(state, GENERATED_AT);
  state = reduce(state, { type: 'preview/confirm' });
  state = reduce(state, { type: 'calendar/prepare', dtStamp: DT_STAMP });

  const html = state.calendar.html;
  assert.equal(typeof html, 'string', 'the HTML export is generated');
  assert.ok(html.includes('<!DOCTYPE html>') && html.includes('</html>'), 'a complete standalone document');
  assert.ok(html.includes('My timetable'), 'the timetable title appears');
  assert.ok(html.includes('Ada Lovelace'), 'the student name appears in the file');

  const verified = state.timetable.entries.filter((entry) => linkState(entry) === 'verified');
  const clickable = (html.match(/<a class="link link-ok" href="https:\/\/meet\.google\.com[^"]*"/g) ?? []).length;
  assert.equal(clickable, verified.length, 'exactly one clickable link per verified lesson');
  // a held-back lesson whose URL is not shared with a verified lesson never
  // appears as a clickable link (CMS 302 has both kinds, so match by count)
  const verifiedUrls = new Set(verified.map((entry) => entry.lessonUrl));
  const heldBack = state.timetable.entries.filter((entry) => linkState(entry) === 'needs-verification' && entry.lessonUrl && !verifiedUrls.has(entry.lessonUrl));
  assert.ok(heldBack.length > 0, 'the selection contains a held-back lesson with a private URL');
  for (const entry of heldBack) {
    assert.ok(!html.includes(`href="${entry.lessonUrl}"`), 'held-back links are never clickable');
  }
});
