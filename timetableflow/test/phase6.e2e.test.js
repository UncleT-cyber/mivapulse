import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { loadWorkbook, processWorkbook } from '../src/index.js';
import { selectCourses } from '../src/student/selection.js';
import { buildStudentTimetable, linkState } from '../src/student/timetable.js';
import { buildViewModel } from '../src/render/viewModel.js';
import { renderHtml } from '../src/render/html.js';
import { toICalendar } from '../src/export/ical.js';
import { buildFixtureBuffer, FIXTURE_URLS } from './helpers/fixtureWorkbook.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 6 modules never import Excel knowledge', async () => {
  const files = [
    'src/student/selection.js',
    'src/student/timetable.js',
    'src/render/viewModel.js',
    'src/render/html.js',
    'src/export/ical.js',
  ];
  for (const file of files) {
    const source = await readFile(path.join(ROOT, file), 'utf8');
    // no ExcelJS dependency, no filesystem access, no pipeline entry points
    assert.ok(!/from\s+['"]exceljs['"]/.test(source), `${file} imports exceljs`);
    assert.ok(!/import\s+[^'"]*['"]node:fs/.test(source), `${file} reads the filesystem`);
    assert.ok(!/\bloadWorkbook\b|\bprocessWorkbook\b|\bparseWorkbook\b/.test(source), `${file} runs the Excel pipeline`);
  }
});

test('workbook -> normalized data -> student timetable -> HTML + ICS', async () => {
  // Excel boundary: happens exactly once, at the pipeline entry point
  const workbook = await loadWorkbook(await buildFixtureBuffer());
  const normalized = processWorkbook(workbook);
  assert.equal(normalized.entries.length, 18);

  const selection = selectCourses(normalized.entries, [
    'IFT 211', // exact code
    'NSC 309', // conflicted link
    'csc 101', // title-fallback join, input case-insensitive
    'MISSING 999', // not in the data at all
  ]);

  assert.deepEqual(selection.unmatched, [{ input: 'MISSING 999', normalized: 'MISSING 999' }]);
  assert.equal(selection.entries.length, 3);

  const timetable = buildStudentTimetable(selection.entries, {
    student: 'Test Student',
    selection: selection.requested.map((item) => item.normalized),
    generatedAt: '2026-09-01T10:00:00.000Z',
  });

  assert.equal(timetable.summary.lessons, 3);
  assert.equal(timetable.summary.courses, 3);
  assert.equal(timetable.summary.days, 2);
  assert.equal(timetable.summary.conflictPairs, 0);
  assert.deepEqual(timetable.summary.linkStates, {
    verified: 1,
    'needs-verification': 2, // CSC 101 joined by title, NSC 309 has two candidate URLs
    missing: 0,
  });

  const [ift, csc, nsc] = timetable.entries.map((entry) => entry.courseCode);
  assert.deepEqual([ift, csc, nsc], ['IFT 211', 'CSC 101', 'NSC 309']); // chronological
  assert.equal(linkState(timetable.entries[1]), 'needs-verification');
  assert.equal(linkState(timetable.entries[2]), 'needs-verification');

  const viewModel = buildViewModel(timetable, { title: 'Test Student timetable' });
  const html = renderHtml(viewModel);

  assert.ok(html.includes('Test Student'));
  assert.ok(html.includes('Join lesson'));
  assert.ok(html.includes('Lesson link needs verification'));
  assert.ok(
    html.includes('No link row carries this course code, so the match rests on the course title alone.'),
    'the offline HTML states why the link is held back',
  );
  assert.ok(html.includes(FIXTURE_URLS.ift211), 'the verified link stays clickable in the file');
  assert.ok(!html.includes(FIXTURE_URLS.css101), 'a title-only match never renders its URL');
  assert.ok(html.includes('Monday, 14 Sep 2026'));
  assert.ok(html.includes('Wednesday, 16 Sep 2026'));
  assert.ok(!/excel|xlsx|worksheet/i.test(html));

  const { ics, events } = toICalendar(timetable.entries, {
    student: 'Test Student',
    calendarName: 'Test Student timetable',
    dtStamp: '2026-09-01T10:00:00.000Z',
  });

  assert.equal(events.length, 3);
  const states = Object.fromEntries(events.map((event) => [event.summary.split(' - ')[0], event]));
  assert.ok(states['IFT 211'].url.includes('meet.google.com'));
  assert.equal(states['CSC 101'].url, null); // title-joined: URL kept as evidence, never exported
  assert.equal(states['CSC 101'].linkState, 'needs-verification');
  assert.equal(states['NSC 309'].url, null); // conflict preserved in the calendar too
  assert.equal(states['NSC 309'].linkState, 'needs-verification');
  assert.equal(ics.split('URL:').length - 1, 1, 'only the deterministic match exports a URL');
  assert.ok(ics.includes('DTSTART:20260914T150000\r\n'));
  assert.ok(ics.includes('DTSTART:20260916T170000\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});
