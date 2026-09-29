import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  parseCourseCell,
  normalizeCourseCode,
  stripMivaPrefix,
  splitCourseCodes,
  collapseWhitespace,
} from '../src/parser/courseCell.js';

test('parses a plain course cell with trailing space', () => {
  const result = parseCourseCell('IFT 211 - Digital Logic Design ');
  assert.equal(result.ok, true);
  assert.equal(result.courseCode, 'IFT 211');
  assert.deepEqual(result.courseCodes, ['IFT 211']);
  assert.equal(result.courseTitle, 'Digital Logic Design');
  assert.equal(result.rawCellText, 'IFT 211 - Digital Logic Design ');
});

test('parses a cell without spaces around the hyphen', () => {
  const result = parseCourseCell('ACC 306- Taxation II');
  assert.equal(result.ok, true);
  assert.equal(result.courseCode, 'ACC 306');
  assert.equal(result.courseTitle, 'Taxation II');
});

test('parses a cell with an embedded tab before the hyphen', () => {
  const result = parseCourseCell('IFT 410\t - System Integration and Architecture');
  assert.equal(result.ok, true);
  assert.equal(result.courseCode, 'IFT 410');
  assert.equal(result.courseTitle, 'System Integration and Architecture');
});

test('parses an MIVA- prefixed code', () => {
  const result = parseCourseCell('MIVA-ACC 316- Intermediate Accounting II');
  assert.equal(result.ok, true);
  assert.equal(result.courseCode, 'MIVA-ACC 316');
});

test('parses slash-combined codes and keeps both parts', () => {
  const result = parseCourseCell('BUA 203/ENT 125 - Business Statistics ');
  assert.equal(result.ok, true);
  assert.equal(result.courseCode, 'BUA 203/ENT 125');
  assert.deepEqual(result.courseCodes, ['BUA 203', 'ENT 125']);
});

test('parses a differently spaced combined code with an MIVA part', () => {
  const result = parseCourseCell('STA 111/ MIVA-ECO 105 - Descriptive Statistics ');
  assert.equal(result.ok, true);
  assert.equal(result.courseCode, 'STA 111/ MIVA-ECO 105');
  assert.deepEqual(result.courseCodes, ['STA 111', 'MIVA-ECO 105']);
});

test('rejects time headers, markers and blank cells', () => {
  assert.equal(parseCourseCell('3:00 - 4:00 pm').reason, 'time-header');
  assert.equal(parseCourseCell('1:30 - 3:00 pm').reason, 'time-header');
  assert.equal(parseCourseCell('-').reason, 'stray-marker');
  assert.equal(parseCourseCell('   ').reason, 'blank');
  assert.equal(parseCourseCell(null).reason, 'empty');
  assert.equal(parseCourseCell('NNNNNNNNNNNNNNNNNNNNNNNNNNNNNN').reason, 'not-a-course-cell');
});

test('rejects a cell with no title after the hyphen', () => {
  assert.equal(parseCourseCell('IFT 211 - ').ok, false);
});

test('recovers a course cell that lost its separator (real case: November 2025!E40)', () => {
  const result = parseCourseCell('MIVA-PAD 211\tFoundations of Political Economy');
  assert.equal(result.ok, true);
  assert.equal(result.recovered, true);
  assert.equal(result.courseCode, 'MIVA-PAD 211');
  assert.equal(result.courseTitle, 'Foundations of Political Economy');
  assert.deepEqual(result.courseCodes, ['MIVA-PAD 211']);

  // the strict path is never flagged as recovered
  assert.equal(parseCourseCell('IFT 211 - Digital Logic Design').recovered, undefined);

  // the recovery rule does NOT open the door to junk, headers or markers
  assert.equal(parseCourseCell('NNNNNNNNNNNNNN').ok, false);
  assert.equal(parseCourseCell('NNNNNNNNNNNNNN').reason, 'not-a-course-cell');
  assert.equal(parseCourseCell('3:00 - 4:00 pm').reason, 'time-header');
  assert.equal(parseCourseCell('-').reason, 'stray-marker');
  assert.equal(parseCourseCell('Week 1 starting 14th September').reason, 'not-a-course-cell');
  assert.equal(parseCourseCell('10:00 - 11:00 am').reason, 'time-header');
});

test('normalizeCourseCode canonical forms', () => {
  assert.equal(normalizeCourseCode('miva_pad 208'), 'MIVA-PAD 208');
  assert.equal(normalizeCourseCode('MIVA ECO 105'), 'MIVA-ECO 105');
  assert.equal(normalizeCourseCode('  IFT   211 '), 'IFT 211');
  assert.equal(normalizeCourseCode('STA 111/ MIVA-ECO 105'), 'STA 111/ MIVA-ECO 105');
});

test('stripMivaPrefix only strips a leading prefix', () => {
  assert.equal(stripMivaPrefix('MIVA-NSC 512'), 'NSC 512');
  assert.equal(stripMivaPrefix('NSC 512'), 'NSC 512');
  assert.equal(stripMivaPrefix('MIVA-MCM 109'), 'MCM 109');
});

test('splitCourseCodes normalizes every part', () => {
  assert.deepEqual(splitCourseCodes('INS 204/MIVA-IFT 204'), ['INS 204', 'MIVA-IFT 204']);
  assert.deepEqual(splitCourseCodes('STA 111/ MIVA-ECO 105'), ['STA 111', 'MIVA-ECO 105']);
});

test('collapseWhitespace handles tabs and newlines', () => {
  assert.equal(collapseWhitespace('A\tB\n  C '), 'A B C');
});
