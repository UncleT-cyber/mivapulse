/**
 * Phase 7 — UI state machine.
 *
 * Every workflow transition the student can trigger, including the failure
 * modes: no timetable, no course selected, unmatched course, calendar export
 * failure with the timetable preserved.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { loadWorkbook, processWorkbook } from '../src/index.js';
import { initialState, reduce, NOTICE_COPY, CALENDAR_NAME, REMINDER_CHOICES } from '../src/ui/state.js';
import { PARSE_ERRORS } from '../src/app/messages.js';
import { buildFixtureBuffer } from './helpers/fixtureWorkbook.js';
import { toCourses } from './helpers/uiFlow.js';

const dataset = processWorkbook(await loadWorkbook(await buildFixtureBuffer()));

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function uploaded() {
  let state = initialState();
  state = reduce(state, { type: 'upload/started', filename: 'MIVA Master.xlsx' });
  state = reduce(state, { type: 'upload/stage', stage: { id: 'links', label: 'Resolving lesson links…' } });
  return reduce(state, { type: 'upload/succeeded', dataset });
}

test('the workflow starts at the upload screen with no derived data', () => {
  const state = initialState();
  assert.equal(state.step, 'upload');
  assert.equal(state.status, 'idle');
  assert.equal(state.dataset, null);
  assert.deepEqual(state.selected, []);
  assert.equal(state.timetable, null);
  assert.equal(state.template, 'minimal');
});

test('an upload run moves through parsing to a loaded dataset', () => {
  let state = reduce(initialState(), { type: 'upload/started', filename: 'MIVA Master.xlsx' });
  assert.equal(state.status, 'parsing');
  assert.equal(state.stage.id, 'reading');
  assert.equal(state.filename, 'MIVA Master.xlsx');

  state = reduce(state, { type: 'upload/stage', stage: { id: 'links', label: 'Resolving lesson links…' } });
  assert.equal(state.stage.id, 'links');

  state = reduce(state, { type: 'upload/succeeded', dataset });
  assert.equal(state.status, 'loaded');
  assert.equal(state.step, 'upload');
  assert.equal(state.stage, null);
  assert.equal(state.dataset.entries.length, 18);

  state = reduce(state, { type: 'upload/continue' });
  assert.equal(state.step, 'period', 'the workbook is parsed first, then the period step');

  state = reduce(state, { type: 'period/select', id: 'all' });
  assert.equal(state.step, 'period', 'choosing a period keeps the student on the period screen');
  assert.equal(state.periodDataset.entries.length, 18, 'the chosen period is projected from the full dataset');

  state = reduce(state, { type: 'period/continue' });
  assert.equal(state.step, 'courses');
});

test('every upload failure kind shows honest copy', () => {
  for (const kind of Object.keys(PARSE_ERRORS)) {
    const state = reduce(initialState(), { type: 'upload/failed', kind });
    assert.equal(state.status, 'error');
    assert.equal(state.error.kind, kind);
    assert.equal(state.error.message, PARSE_ERRORS[kind].message);
    assert.equal(state.notice.text, PARSE_ERRORS[kind].message);
    assert.equal(state.dataset, null);
  }

  const empty = reduce(initialState(), { type: 'upload/succeeded', dataset: { entries: [] } });
  assert.equal(empty.status, 'error');
  assert.equal(empty.error.kind, 'no-lessons');
  assert.equal(empty.notice.text, PARSE_ERRORS['no-lessons'].message);
});

test('search and course selection update only selection state', () => {
  let state = toCourses(uploaded());
  state = reduce(state, { type: 'search/set', value: 'ift' });
  assert.equal(state.search, 'ift');

  state = reduce(state, { type: 'course/toggle', code: 'IFT 211' });
  state = reduce(state, { type: 'course/toggle', code: 'NSC 309' });
  assert.deepEqual(state.selected, ['IFT 211', 'NSC 309']);

  state = reduce(state, { type: 'course/toggle', code: 'IFT 211' });
  assert.deepEqual(state.selected, ['NSC 309']);

  state = reduce(state, { type: 'course/remove', code: 'NSC 309' });
  assert.deepEqual(state.selected, []);
});

test('continuing without a timetable or without courses is refused with copy', () => {
  let state = uploaded();
  state = reduce(state, { type: 'upload/continue' });
  state = reduce(state, { type: 'courses/continue' });
  assert.equal(state.notice.text, NOTICE_COPY['no-period'], 'a period must be chosen before courses exist');

  state = toCourses(state);
  state = reduce(state, { type: 'courses/continue' });
  assert.equal(state.notice.kind, 'error');
  assert.equal(state.notice.text, NOTICE_COPY['no-courses']);
  assert.equal(state.step, 'courses');

  state = reduce(state, { type: 'course/toggle', code: 'NOPE 999' });
  state = reduce(state, { type: 'courses/continue' });
  assert.equal(state.notice.text, NOTICE_COPY['no-match']);
  assert.equal(state.timetable, null);

  const noDataset = reduce(initialState(), { type: 'courses/continue' });
  assert.equal(noDataset.notice.text, NOTICE_COPY['no-dataset']);
});

test('a generated timetable keeps unmatched courses visible instead of dropping them', () => {
  let state = toCourses(uploaded());
  state = reduce(state, { type: 'course/toggle', code: 'IFT 211' });
  state = reduce(state, { type: 'course/toggle', code: 'NSC 309' });
  state = reduce(state, { type: 'course/toggle', code: 'CSC 101' });
  state = reduce(state, { type: 'course/toggle', code: 'NOPE 999' });

  state = reduce(state, { type: 'courses/continue', generatedAt: '2026-09-01T10:00:00.000Z' });

  assert.equal(state.step, 'design');
  assert.equal(state.timetable.summary.lessons, 3);
  assert.deepEqual(state.selection.unmatched, [{ input: 'NOPE 999', normalized: 'NOPE 999' }]);
  assert.deepEqual(state.selected, ['IFT 211', 'NSC 309', 'CSC 101', 'NOPE 999'], 'selection is preserved');
  assert.equal(state.viewModel.summary.linkStates['needs-verification'], 2, 'NSC 309 + title-only CSC 101');
  assert.equal(state.notice, null);
});

test('changing the course selection invalidates the generated timetable', () => {
  let state = toCourses(uploaded());
  state = reduce(state, { type: 'course/toggle', code: 'IFT 211' });
  state = reduce(state, { type: 'courses/continue', generatedAt: '2026-09-01T10:00:00.000Z' });
  assert.ok(state.timetable);

  state = reduce(state, { type: 'course/toggle', code: 'SEN 306' });
  assert.equal(state.timetable, null, 'stale timetable is never served');
  assert.equal(state.viewModel, null);

  state = reduce(state, { type: 'step/goto', step: 'design' });
  assert.ok(state.timetable, 'design navigation regenerates from the new selection');
  assert.equal(state.step, 'design');
});

test('navigation guards require the data each step depends on', () => {
  let state = uploaded();
  state = reduce(state, { type: 'step/goto', step: 'preview' });
  assert.equal(state.notice.text, NOTICE_COPY['no-timetable']);
  assert.equal(state.step, 'upload');

  state = reduce(state, { type: 'step/goto', step: 'period' });
  assert.equal(state.step, 'period', 'the period step is reachable once a workbook is loaded');
  assert.equal(state.notice, null);

  state = reduce(state, { type: 'step/goto', step: 'courses' });
  assert.equal(state.notice.text, NOTICE_COPY['no-period'], 'courses stay locked until a period is chosen');
  assert.equal(state.step, 'period');

  state = toCourses(state);
  state = reduce(state, { type: 'step/goto', step: 'courses' });
  assert.equal(state.step, 'courses');

  const withoutDataset = reduce(initialState(), { type: 'step/goto', step: 'courses' });
  assert.equal(withoutDataset.notice.text, NOTICE_COPY['no-dataset']);
  assert.equal(withoutDataset.step, 'upload');

  const unknownStep = reduce(uploaded(), { type: 'step/goto', step: 'admin' });
  assert.equal(unknownStep.step, 'upload');
});

test('template selection accepts only known templates', () => {
  let state = uploaded();
  state = reduce(state, { type: 'template/select', id: 'dark' });
  assert.equal(state.template, 'dark');

  const rejected = reduce(state, { type: 'template/select', id: 'neon-holographic' });
  assert.equal(rejected, state, 'unknown templates are ignored');
});

test('confirming the timetable opens the calendar step and exports ICS', () => {
  let state = toCourses(uploaded());
  state = reduce(state, { type: 'course/toggle', code: 'IFT 211' });
  state = reduce(state, { type: 'course/toggle', code: 'NSC 309' });
  state = reduce(state, { type: 'courses/continue', generatedAt: '2026-09-01T10:00:00.000Z' });
  state = reduce(state, { type: 'preview/confirm' });
  assert.equal(state.step, 'calendar');

  state = reduce(state, { type: 'calendar/prepare', dtStamp: '2026-09-01T10:00:00.000Z' });
  assert.equal(state.calendar.status, 'ready');
  assert.equal(state.calendar.events, 2);
  assert.ok(state.calendar.ics.includes('BEGIN:VCALENDAR'));
  assert.ok(state.calendar.ics.includes(`X-WR-CALNAME:${CALENDAR_NAME}`));
  assert.ok(state.calendar.ics.includes('X-TIMETABLEFLOW-LINK-STATE:needs-verification'));

  state = reduce(state, { type: 'calendar/exported' });
  assert.equal(state.step, 'complete');
  assert.equal(state.calendar.status, 'exported');
});

test('a failed calendar export keeps the timetable and allows a retry', () => {
  let state = toCourses(uploaded());
  state = reduce(state, { type: 'course/toggle', code: 'IFT 211' });
  state = reduce(state, { type: 'courses/continue', generatedAt: '2026-09-01T10:00:00.000Z' });
  state = reduce(state, { type: 'preview/confirm' });

  const before = state.timetable;
  const failed = reduce(state, { type: 'calendar/failed', message: 'the file could not be saved.' });
  assert.equal(failed.calendar.status, 'error');
  assert.equal(failed.timetable, before, 'the student keeps their timetable');
  assert.equal(failed.step, 'calendar');
  assert.match(failed.notice.text, /Calendar export failed/);
  assert.match(failed.notice.text, /try again/i);

  const retried = reduce(failed, { type: 'calendar/retry' });
  assert.equal(retried.calendar.status, 'idle');
  assert.equal(retried.notice, null);

  const prepared = reduce(retried, { type: 'calendar/prepare', dtStamp: '2026-09-01T10:00:00.000Z' });
  assert.equal(prepared.calendar.status, 'ready');
});

test('the student name reaches the timetable and the calendar', () => {
  let state = toCourses(uploaded());
  state = reduce(state, { type: 'course/toggle', code: 'IFT 211' });
  state = reduce(state, { type: 'courses/continue', generatedAt: '2026-09-01T10:00:00.000Z' });

  state = reduce(state, { type: 'student/set', value: 'Ada Obi' });
  state = reduce(state, { type: 'regenerate', generatedAt: '2026-09-01T10:00:00.000Z' });
  assert.equal(state.timetable.student, 'Ada Obi');

  state = reduce(state, { type: 'calendar/prepare', dtStamp: '2026-09-01T10:00:00.000Z' });
  assert.ok(state.calendar.ics.includes('Student: Ada Obi'));
});

test('the reducer never mutates the state it is given', () => {
  const original = deepFreeze(uploaded());
  const actions = [
    { type: 'upload/continue' },
    { type: 'period/select', id: 'all' },
    { type: 'period/continue' },
    { type: 'course/toggle', code: 'IFT 211' },
    { type: 'courses/continue', generatedAt: '2026-09-01T10:00:00.000Z' },
    { type: 'template/select', id: 'glass' },
    { type: 'preview/confirm' },
    { type: 'calendar/prepare', dtStamp: '2026-09-01T10:00:00.000Z' },
    { type: 'calendar/exported' },
  ];

  let current = original;
  for (const action of actions) {
    const next = reduce(current, action);
    assert.notEqual(next, current, `${action.type} should produce a new state`);
    current = next;
  }

  assert.equal(reduce(current, { type: 'notice/clear' }), current, 'no notice to clear');
  assert.equal(reduce(original, { type: 'not-a-real-action' }), original, 'unknown actions are ignored');
  assert.equal(Object.isFrozen(original), true);
});

test('the reminder choice is state, and it changes the exported file', () => {
  const dtStamp = '2026-09-01T10:00:00.000Z';
  assert.equal(initialState().reminderMinutes, 15, 'reminders default to 15 minutes before');
  assert.deepEqual(REMINDER_CHOICES, [10, 15, 30, 0], 'the offered choices');

  let state = toCourses(uploaded());
  state = reduce(state, { type: 'course/toggle', code: 'IFT 211' });
  state = reduce(state, { type: 'courses/continue', generatedAt: dtStamp });
  state = reduce(state, { type: 'preview/confirm' });
  state = reduce(state, { type: 'calendar/prepare', dtStamp });
  assert.ok(state.calendar.ics.includes('TRIGGER:-PT15M'), 'default alarm is in the file');

  const invalid = reduce(state, { type: 'calendar/reminder/set', minutes: 7 });
  assert.equal(invalid, state, 'unknown reminder choices are ignored');

  const switched = reduce(state, { type: 'calendar/reminder/set', minutes: 30 });
  assert.equal(switched.reminderMinutes, 30);
  assert.equal(switched.calendar.status, 'idle', 'a prepared file no longer matches the choice');
  assert.equal(switched.timetable, state.timetable, 'the timetable is untouched');

  const again = reduce(switched, { type: 'calendar/prepare', dtStamp });
  assert.ok(again.calendar.ics.includes('TRIGGER:-PT30M'));

  const off = reduce(again, { type: 'calendar/reminder/set', minutes: 0 });
  const offFile = reduce(off, { type: 'calendar/prepare', dtStamp });
  assert.equal(offFile.reminderMinutes, 0);
  assert.ok(!offFile.calendar.ics.includes('BEGIN:VALARM'), 'off means no alarm in the file');

  const same = reduce(again, { type: 'calendar/reminder/set', minutes: 30 });
  assert.equal(same, again, 're-selecting the current choice changes nothing');
});
