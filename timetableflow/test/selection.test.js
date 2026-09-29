import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { selectCourses, normalizeSelection, courseCatalog } from '../src/student/selection.js';
import { makeEntry, makeUnlinkedEntry } from './helpers/entryFactory.js';

const ENTRIES = [
  makeEntry({ courseCode: 'IFT 211', courseTitle: 'Digital Logic Design', date: '2026-09-14', startTime: '15:00', endTime: '16:00' }),
  makeEntry({ courseCode: 'IFT 211', courseTitle: 'Digital Logic Design', date: '2026-09-16', startTime: '15:00', endTime: '16:00', sourceColumn: 'D', sourceRow: 21 }),
  makeEntry({ courseCode: 'SEN 306', courseTitle: 'Software Construction', date: '2026-09-14', startTime: '16:00', endTime: '17:00' }),
  makeEntry({ courseCode: 'MIVA-NSC 512', courseCodes: ['MIVA-NSC 512'], courseTitle: 'Gerontology/Geriatric Nursing', date: '2026-09-15' }),
  makeEntry({ courseCode: 'INS 204/MIVA-IFT 204', courseCodes: ['INS 204', 'MIVA-IFT 204'], courseTitle: 'Systems Analysis and Design', date: '2026-09-17' }),
  makeEntry({ courseCode: 'BUA 203/ENT 125', courseCodes: ['BUA 203', 'ENT 125'], courseTitle: 'Business Statistics', date: '2026-09-17' }),
  makeUnlinkedEntry({ courseCode: 'PAD 302', courseTitle: 'Administrative Behaviour', date: '2026-09-22' }),
];

test('selection codes are canonicalized and de-duplicated', () => {
  const requested = normalizeSelection(['  ift 211 ', 'IFT 211', '', null, 'miva nsc 512']);
  assert.deepEqual(
    requested.map((r) => r.normalized),
    ['IFT 211', 'MIVA-NSC 512'],
  );
});

test('selects entries by exact code', () => {
  const result = selectCourses(ENTRIES, ['IFT 211']);
  assert.equal(result.entries.length, 2);
  assert.equal(result.stats.matchedCourses, 1);
  assert.equal(result.stats.lessons, 2);
  assert.deepEqual(result.courses[0].courseCodes, ['IFT 211']);
  assert.equal(result.courses[0].firstDate, '2026-09-14');
  assert.equal(result.courses[0].lastDate, '2026-09-16');
});

test('MIVA- prefix differences do not block a selection', () => {
  const result = selectCourses(ENTRIES, ['NSC 512']);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].courseCode, 'MIVA-NSC 512');
});

test('slash-combined codes match part by part, both directions', () => {
  const byPart = selectCourses(ENTRIES, ['INS 204']);
  assert.equal(byPart.entries.length, 1);
  assert.equal(byPart.entries[0].courseCode, 'INS 204/MIVA-IFT 204');

  const byWhole = selectCourses(ENTRIES, ['BUA 203/ENT 125']);
  assert.equal(byWhole.entries.length, 1);

  const byOtherHalf = selectCourses(ENTRIES, ['ENT 125']);
  assert.equal(byOtherHalf.entries.length, 1);
});

test('unmatched selections are reported instead of silently dropped', () => {
  const result = selectCourses(ENTRIES, ['IFT 211', 'CSC 999']);
  assert.equal(result.entries.length, 2);
  assert.deepEqual(result.unmatched, [{ input: 'CSC 999', normalized: 'CSC 999' }]);
  assert.equal(result.stats.unmatchedCourses, 1);
});

test('titles never decide a match', () => {
  const result = selectCourses(ENTRIES, ['Digital Logic Design']);
  assert.equal(result.entries.length, 0);
  assert.equal(result.unmatched.length, 1);
});

test('course catalogue groups codes, titles and dates from normalized data', () => {
  const catalog = courseCatalog(ENTRIES);
  const codes = catalog.map((c) => c.courseCode);
  assert.ok(codes.includes('IFT 211'));
  assert.ok(codes.includes('NSC 512')); // stripped MIVA- prefix for display
  assert.ok(codes.includes('PAD 302'));

  const ift = catalog.find((c) => c.courseCode === 'IFT 211');
  assert.equal(ift.lessons, 2);
  assert.deepEqual(ift.altCodes, ['IFT 211']);
  assert.deepEqual(ift.titles, ['Digital Logic Design']);
  assert.equal(ift.firstDate, '2026-09-14');

  const pad = catalog.find((c) => c.courseCode === 'PAD 302');
  assert.equal(pad.lessons, 1);
});
