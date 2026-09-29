/**
 * Phase 7 — complete student workflow, end to end.
 *
 *   workbook bytes -> adapter -> normalized dataset -> course selection
 *   -> student timetable -> template -> screens -> .ics export
 *
 * The NSC 309 leg is an architectural integrity check: the ambiguous link must
 * survive every UI transformation as `needs-verification` with lessonUrl null.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import ExcelJS from 'exceljs';

import { parseWorkbookBytes, setExcelJS } from '../src/app/excelAdapter.js';
import { initialState, reduce } from '../src/ui/state.js';
import { renderApp } from '../src/ui/screens.js';
import { calendarFilename, completionStats } from '../src/ui/selectors.js';
import { linkState } from '../src/student/timetable.js';
import { buildFixtureBuffer, FIXTURE_URLS } from './helpers/fixtureWorkbook.js';
import { lessonBlock, stripTags, toCourses } from './helpers/uiFlow.js';

const DT_STAMP = '2026-09-01T10:00:00.000Z';

test('the whole student flow works from workbook bytes to a calendar file', async () => {
  setExcelJS(ExcelJS);

  // 1. upload + parse (exactly what the browser glue does)
  const stages = [];
  const dataset = await parseWorkbookBytes(await buildFixtureBuffer(), {
    filename: 'MIVA Master.xlsx',
    onStage: (stage) => stages.push(stage.id),
  });
  assert.equal(dataset.entries.length, 18);
  assert.equal(stages.length, 4);

  // 2. state moves to the period screen, then to the courses screen
  let state = reduce(initialState(), { type: 'upload/started', filename: 'MIVA Master.xlsx' });
  state = reduce(state, { type: 'upload/succeeded', dataset });
  state = reduce(state, { type: 'upload/continue' });
  assert.equal(state.step, 'period', 'parsing is followed by period selection');
  state = toCourses(state);
  assert.equal(state.step, 'courses');
  assert.ok(stripTags(renderApp(state)).includes('courses found'), 'the catalogue is rendered from the dataset');

  // 3. search, then select courses (including one that cannot be matched)
  state = reduce(state, { type: 'search/set', value: 'nsc' });
  const results = renderApp(state);
  assert.ok(results.includes('data-code="NSC 309"'));
  assert.ok(results.includes('data-code="NSC 512"'));
  assert.ok(!results.includes('data-code="IFT 211"'));

  state = reduce(state, { type: 'search/set', value: '' });
  for (const code of ['IFT 211', 'NSC 309', 'CSC 101', 'NOPE 999']) {
    state = reduce(state, { type: 'course/toggle', code });
  }
  const selectionScreen = renderApp(state);
  assert.ok(selectionScreen.includes('4 courses selected'));
  assert.ok(selectionScreen.includes('Course not found in this timetable'), 'unmatched course is surfaced');

  // 4. generate the timetable (design step)
  state = reduce(state, { type: 'courses/continue', generatedAt: DT_STAMP });
  assert.equal(state.step, 'design');
  assert.equal(state.timetable.summary.lessons, 3);
  assert.deepEqual(state.selection.unmatched, [{ input: 'NOPE 999', normalized: 'NOPE 999' }]);

  // 5. choose a template — previews use the real lessons
  state = reduce(state, { type: 'template/select', id: 'dark' });
  const designScreen = renderApp(state);
  assert.ok(designScreen.includes('data-template="dark"'));
  assert.ok(designScreen.includes('IFT 211'));
  assert.ok(designScreen.includes('NSC 309'));

  // 6. preview: link states and the NSC 309 integrity check
  state = reduce(state, { type: 'step/goto', step: 'preview' });
  const preview = renderApp(state);
  assert.ok(preview.includes('data-template="dark"'), 'the chosen template is used');
  assert.ok(preview.includes('Monday, 14 Sep 2026'));
  assert.ok(preview.includes('Wednesday, 16 Sep 2026'));

  const verified = lessonBlock(preview, 'IFT 211');
  assert.ok(verified.includes(`href="${FIXTURE_URLS.ift211}"`), 'verified links stay clickable');

  const ambiguous = lessonBlock(preview, 'NSC 309');
  assert.ok(ambiguous.includes('Lesson link needs verification'));
  assert.ok(!ambiguous.includes('href='), 'NSC 309 is never rendered as a link');
  assert.ok(
    ambiguous.includes(FIXTURE_URLS.nsc309a) && ambiguous.includes(FIXTURE_URLS.nsc309b),
    'candidates stay available as secondary, non-clickable detail',
  );
  assert.ok(!ambiguous.includes('Join live lesson'), 'an ambiguous link never becomes a join button');
  assert.ok(state.selection.entries.find((entry) => entry.courseCode === 'NSC 309').lessonUrl === null);
  assert.equal(
    linkState(state.selection.entries.find((entry) => entry.courseCode === 'NSC 309')),
    'needs-verification',
  );

  // a title-only join keeps its URL as evidence but is never verified
  const titleOnly = lessonBlock(preview, 'CSC 101');
  assert.ok(titleOnly.includes('Lesson link needs verification'), 'a title-only match needs verification');
  assert.ok(!titleOnly.includes('href='), 'the title-joined URL is not offered as a clickable join link');
  assert.ok(titleOnly.includes('data-reason="title-only-match"'), 'the reason is stated under the state');
  assert.equal(
    linkState(state.selection.entries.find((entry) => entry.courseCode === 'CSC 101')),
    'needs-verification',
  );

  // 7. confirm -> calendar screen -> export
  state = reduce(state, { type: 'preview/confirm' });
  assert.equal(state.step, 'calendar');

  // the calendar screen offers per-lesson Google Calendar links (phone-friendly)
  const calendarScreen = renderApp(state);
  assert.equal(
    (calendarScreen.match(/calendar\.google\.com\/calendar\/render/g) ?? []).length,
    3,
    'one Google Calendar link per lesson',
  );
  assert.ok(calendarScreen.includes('Add to Google Calendar'));
  assert.ok(calendarScreen.includes('Remind me before each lesson'));
  assert.match(calendarScreen, /id="tf-rem-15"[^>]*checked/, 'reminders default to 15 minutes');
  assert.ok(!calendarScreen.includes('conflict-a-001'), 'no candidate URL is offered as a link');

  state = reduce(state, { type: 'calendar/prepare', dtStamp: DT_STAMP });
  assert.equal(state.calendar.status, 'ready');
  assert.equal(state.calendar.events, 3);

  const ics = state.calendar.ics;
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'), 'RFC 5545 line endings');
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(ics.includes('X-TIMETABLEFLOW-LINK-STATE:verified'));
  assert.ok(ics.includes('X-TIMETABLEFLOW-LINK-STATE:needs-verification'));
  assert.ok(ics.includes(`URL:${FIXTURE_URLS.ift211}\r\n`), 'verified URL is exported');
  assert.ok(!ics.includes(FIXTURE_URLS.css101), 'a title-only match never exports its URL');
  assert.ok(!ics.includes(FIXTURE_URLS.nsc309a), 'an unverified candidate is never exported');
  assert.ok(!ics.includes(FIXTURE_URLS.nsc309b), 'an unverified candidate is never exported');
  assert.equal(ics.split('URL:').length - 1, 1, 'only the deterministic match carries a URL');
  assert.equal(ics.split('BEGIN:VALARM').length - 1, 3, 'every lesson gets a reminder alarm');
  assert.ok(ics.includes('TRIGGER:-PT15M\r\n'), 'the default reminder is 15 minutes before');
  assert.equal(ics.split('END:VALARM').length - 1, 3, 'every alarm is closed');
  assert.equal(ics.split('X-TIMETABLEFLOW-LINK-STATE:').length - 1, 3, 'every event carries its link state');
  assert.ok(ics.includes('DTSTART:20260914T150000'), 'date + start time are preserved');
  assert.ok(ics.includes('DTEND:20260914T160000'), 'end time is preserved');
  assert.ok(ics.includes('DTSTART:20260916T170000'));

  // 8. completion state with real totals
  state = reduce(state, { type: 'calendar/exported' });
  assert.equal(state.step, 'complete');

  const stats = completionStats(state);
  assert.equal(stats.classes, 3);
  assert.equal(stats.courses, 3);
  assert.equal(stats.period, 'September 2026');
  assert.equal(stats.linkStates['needs-verification'], 2);

  const completeHtml = renderApp(state);
  assert.equal(
    (completeHtml.match(/calendar\.google\.com\/calendar\/render/g) ?? []).length,
    3,
    'the Google Calendar links survive to the completion screen',
  );
  const complete = stripTags(completeHtml);
  assert.ok(complete.includes('Your timetable is ready.'));
  assert.ok(complete.includes('3 classes'));
  assert.ok(complete.includes('3 courses'));
  assert.ok(complete.includes('Google Calendar'));

  // switching the reminder off and re-exporting removes the alarms
  const dtStamp = '2026-09-01T10:00:00.000Z';
  const remindersOff = reduce(reduce(state, { type: 'calendar/reminder-set', minutes: 0 }), { type: 'calendar/reminder/set', minutes: 0 });
  assert.equal(remindersOff.reminderMinutes, 0);
  const noAlarm = reduce(remindersOff, { type: 'calendar/prepare', dtStamp });
  assert.ok(!noAlarm.calendar.ics.includes('BEGIN:VALARM'), 'off removes every alarm');
  assert.equal(noAlarm.calendar.events, 3, 'switching alarms off keeps every lesson');

  // 9. the calendar file is named deterministically for the student
  assert.equal(calendarFilename(state, '2026-09-01'), 'timetableflow-2026-09-01.ics');
  assert.equal(
    calendarFilename({ ...state, student: 'Ada Obi' }, '2026-09-01'),
    'timetableflow-ada-obi-2026-09-01.ics',
  );
});
