import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { buildStudentTimetable, linkState, linkStateReason, LINK_STATES, LINK_REASONS } from '../src/student/timetable.js';
import { makeEntry, makeConflictedEntry, makeUnlinkedEntry } from './helpers/entryFactory.js';

test('link states: verified / needs-verification / missing', () => {
  assert.equal(linkState(makeEntry()), 'verified');
  assert.equal(linkStateReason(makeEntry()), null);
  assert.equal(linkState(makeConflictedEntry()), 'needs-verification');
  assert.equal(linkStateReason(makeConflictedEntry()), 'conflicting-candidates');
  assert.equal(linkState(makeUnlinkedEntry()), 'missing');
  assert.equal(linkStateReason(makeUnlinkedEntry()), null);
  assert.deepEqual(LINK_STATES, ['verified', 'needs-verification', 'missing']);
  assert.deepEqual(LINK_REASONS, ['conflicting-candidates', 'title-only-match', 'title-mismatch']);
});

test('a joined URL needs verification when its metadata contradicts the timetable', () => {
  const base = makeEntry().match;

  const mismatch = makeEntry({
    match: { ...base, titleMismatch: true, linkTitle: 'Foundations of Communication Research' },
  });
  assert.equal(linkState(mismatch), 'needs-verification', 'code match, contradictory title');
  assert.equal(linkStateReason(mismatch), 'title-mismatch');

  const titleOnly = makeEntry({
    match: { ...base, tier: 'title', rule: 'course-title-fallback' },
  });
  assert.equal(linkState(titleOnly), 'needs-verification', 'title join is not a deterministic identity');
  assert.equal(linkStateReason(titleOnly), 'title-only-match');

  const variant = makeEntry({ match: { ...base, tier: 'variant', rule: 'miva-prefix-stripped-course-code' } });
  assert.equal(linkState(variant), 'verified', 'a code variant stays verified when nothing else disagrees');
  assert.equal(linkStateReason(variant), null);

  const conflicted = makeConflictedEntry();
  assert.equal(linkState(conflicted), 'needs-verification');
  assert.equal(linkStateReason(conflicted), 'conflicting-candidates');
});

test('entries are sorted chronologically regardless of input order', () => {
  const a = makeEntry({ date: '2026-09-16', startTime: '15:00', endTime: '16:00', courseCode: 'BBA 101' });
  const b = makeEntry({ date: '2026-09-14', startTime: '17:00', endTime: '18:00', courseCode: 'ACC 101' });
  const c = makeEntry({ date: '2026-09-14', startTime: '15:00', endTime: '16:00', courseCode: 'CSC 101' });

  const timetable = buildStudentTimetable([a, b, c]);
  assert.deepEqual(
    timetable.entries.map((e) => e.courseCode),
    ['CSC 101', 'ACC 101', 'BBA 101'],
  );
});

test('entries on the same date and slot tie-break on their origin, deterministically', () => {
  const first = makeEntry({ date: '2026-09-14', startTime: '15:00', endTime: '16:00', sourceSheet: 'A', sourceRow: 5, sourceColumn: 'C' });
  const second = makeEntry({ date: '2026-09-14', startTime: '15:00', endTime: '16:00', sourceSheet: 'A', sourceRow: 9, sourceColumn: 'C' });

  const forward = buildStudentTimetable([first, second]).entries.map((e) => e.sourceRow);
  const reversed = buildStudentTimetable([second, first]).entries.map((e) => e.sourceRow);
  assert.deepEqual(forward, reversed);
  assert.deepEqual(forward, [5, 9]);
});

test('days are grouped with their date and weekday', () => {
  const timetable = buildStudentTimetable([
    makeEntry({ date: '2026-09-14', day: 'Monday' }),
    makeEntry({ date: '2026-09-14', day: 'Monday', courseCode: 'SEN 306', sourceColumn: 'D' }),
    makeEntry({ date: '2026-09-16', day: 'Wednesday', courseCode: 'PAD 213' }),
  ]);

  assert.equal(timetable.days.length, 2);
  assert.deepEqual(timetable.days.map((d) => d.date), ['2026-09-14', '2026-09-16']);
  assert.equal(timetable.days[0].day, 'Monday');
  assert.equal(timetable.days[0].entries.length, 2);
});

test('overlapping lessons on the same day are reported as conflicts', () => {
  const timetable = buildStudentTimetable([
    makeEntry({ date: '2026-09-14', startTime: '15:00', endTime: '16:00', courseCode: 'IFT 211' }),
    makeEntry({ date: '2026-09-14', startTime: '15:30', endTime: '16:30', courseCode: 'SEN 306' }),
    makeEntry({ date: '2026-09-14', startTime: '16:30', endTime: '17:30', courseCode: 'PAD 213' }), // no overlap
    makeEntry({ date: '2026-09-16', startTime: '15:00', endTime: '16:00', courseCode: 'MCM 101' }), // other day
  ]);

  assert.equal(timetable.conflicts.length, 1);
  assert.equal(timetable.conflicts[0].overlapMinutes, 30);
  assert.deepEqual(
    timetable.conflicts[0].entries.map((e) => e.courseCode),
    ['IFT 211', 'SEN 306'],
  );
  assert.equal(timetable.summary.conflictPairs, 1);
});

test('back-to-back lessons are not conflicts', () => {
  const timetable = buildStudentTimetable([
    makeEntry({ date: '2026-09-14', startTime: '15:00', endTime: '16:00' }),
    makeEntry({ date: '2026-09-14', startTime: '16:00', endTime: '17:00', courseCode: 'SEN 306' }),
  ]);
  assert.equal(timetable.conflicts.length, 0);
});

test('summary counts courses, days, link states and date range', () => {
  const timetable = buildStudentTimetable(
    [
      makeEntry({ date: '2026-09-14', courseCode: 'IFT 211' }),
      makeEntry({ date: '2026-09-14', courseCode: 'MIVA-NSC 512', courseCodes: ['MIVA-NSC 512'] }),
      makeEntry({ date: '2026-09-16', courseCode: 'NSC 512', courseCodes: ['NSC 512'] }),
      makeConflictedEntry({ date: '2026-09-16' }),
      makeUnlinkedEntry({ date: '2026-09-22', courseCode: 'PAD 302' }),
    ],
    { student: 'Ada', selection: ['IFT 211'] },
  );

  assert.equal(timetable.student, 'Ada');
  assert.deepEqual(timetable.selection, ['IFT 211']);
  assert.equal(timetable.summary.lessons, 5);
  assert.equal(timetable.summary.courses, 4); // NSC 512 counted once with its MIVA- twin
  assert.deepEqual(timetable.summary.courseCodes, ['IFT 211', 'NSC 512', 'NSC 309', 'PAD 302'].sort());
  assert.equal(timetable.summary.days, 3);
  assert.equal(timetable.summary.firstDate, '2026-09-14');
  assert.equal(timetable.summary.lastDate, '2026-09-22');
  assert.deepEqual(timetable.summary.linkStates, { verified: 3, 'needs-verification': 1, missing: 1 });
});

test('entries without a date are kept but excluded from conflict detection', () => {
  const timetable = buildStudentTimetable([
    makeEntry({ date: null, day: null, startTime: '15:00', endTime: '16:00' }),
    makeEntry({ date: null, day: null, startTime: '15:30', endTime: '16:30', courseCode: 'SEN 306' }),
  ]);
  assert.equal(timetable.entries.length, 2);
  assert.equal(timetable.conflicts.length, 0);
  assert.equal(timetable.summary.days, 1);
});
