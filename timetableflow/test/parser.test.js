import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { loadWorkbook, classifyWorkbook, parseWorkbook, validateEntries } from '../src/index.js';
import { buildFixtureBuffer, buildRecoveryFixtureBuffer } from './helpers/fixtureWorkbook.js';

let workbook;
let parsed;

test.before(async () => {
  workbook = await loadWorkbook(await buildFixtureBuffer());
  parsed = parseWorkbook(workbook);
});

test('classifies sheets structurally, not by name', () => {
  const { linkSheet, excluded } = classifyWorkbook(workbook);

  assert.equal(linkSheet.name, 'Live Lesson Links');
  assert.equal(parsed.sheets.parsed.length, 1);
  assert.equal(parsed.sheets.parsed[0].name, 'Fixture Sep 2026 Lesson Time');

  const excludedByName = Object.fromEntries(excluded.map((e) => [e.name, e.reason]));
  assert.equal(excludedByName.Sheet20, 'empty-sheet');
  assert.equal(excludedByName['Fixture September 2023'], 'legacy-cohort-format');
  assert.equal(excludedByName['Fixture Notes'], 'no-day-labels-with-dates');
});

test('slot columns are discovered from the headers (C, D, E)', () => {
  assert.deepEqual(parsed.stats.perSheet[0].slotColumns, ['C', 'D', 'E']);
});

test('stats match the fixture cell census', () => {
  const stats = parsed.stats.perSheet[0];
  assert.equal(stats.scannedCells, 24);
  assert.equal(stats.timeHeaderCells, 6);
  assert.equal(stats.courseCells, 18);
  assert.equal(stats.otherCells, 0);
  assert.equal(stats.weeks, 2);
  assert.equal(stats.dayBlocks, 4);
  assert.equal(stats.entriesMissingDay, 0);
  assert.equal(stats.entriesMissingSlot, 0);
  assert.equal(stats.weekdayMismatches, 0);
  assert.equal(parsed.stats.sheetsParsed, 1);
  assert.equal(parsed.stats.scannedCells, 24);
});

test('extracts exactly the 18 course cells', () => {
  assert.equal(parsed.entries.length, 18);
  assert.equal(parsed.stats.courseCells, parsed.entries.length);
});

test('the merged title steals B2 in week 1 without losing the Monday rows', () => {
  const first = parsed.entries.find((e) => e.sourceCell === 'C3');
  assert.equal(first.courseCode, 'IFT 211');
  assert.equal(first.date, '2026-09-14');
  assert.equal(first.day, 'Monday');
  assert.equal(first.weekIndex, 1);
});

test('row outside the (short) merged day range keeps the day context', () => {
  const entry = parsed.entries.find((e) => e.sourceCell === 'C5');
  assert.equal(entry.courseCode, 'MIVA-MCM 109');
  assert.equal(entry.day, 'Monday');
  assert.equal(entry.date, '2026-09-14');
});

test('misspelled weekday with an embedded newline is normalized', () => {
  const entry = parsed.entries.find((e) => e.sourceCell === 'C7');
  assert.equal(entry.courseCode, 'BUA 203/ENT 125');
  assert.equal(entry.day, 'Wednesday');
  assert.equal(entry.date, '2026-09-16');
  assert.equal(entry.dayRaw, 'Wednessday\n16/09/2026');
});

test('week 2 header row carries the day label and a different slot scheme', () => {
  const entry = parsed.entries.find((e) => e.sourceCell === 'C11');
  assert.equal(entry.courseCode, 'MCM 101');
  assert.equal(entry.weekIndex, 2);
  assert.equal(entry.date, '2026-09-21');
  assert.equal(entry.day, 'Monday');
  assert.equal(entry.slotLabel, '1:30 - 3:00 pm');
  assert.equal(entry.startTime, '13:30');
  assert.equal(entry.endTime, '15:00');
});

test('week 1 slots parse to 24h bounds from the sheet', () => {
  const entry = parsed.entries.find((e) => e.sourceCell === 'E3');
  assert.equal(entry.slotLabel, '5:00 - 6:00 pm');
  assert.equal(entry.startTime, '17:00');
  assert.equal(entry.endTime, '18:00');
});

test('stray marker and whitespace-only cells are ignored without resetting context', () => {
  const code = parsed.entries.find((e) => e.sourceCell === 'D14');
  assert.equal(code.courseCode, 'ECO 306');
  assert.equal(code.day, 'Monday');
  assert.equal(code.date, '2026-09-21');
  assert.ok(!parsed.entries.some((e) => e.sourceCell === 'C14'));
});

test('same-slot duplicates are both kept', () => {
  const dupes = parsed.entries.filter((e) => e.courseCode === 'MCM 101');
  assert.equal(dupes.length, 2);
  assert.deepEqual(dupes.map((e) => e.sourceCell), ['C11', 'C12']);
});

test('course codes are canonical, titles collapsed', () => {
  const underscore = parsed.entries.find((e) => e.sourceCell === 'D4');
  assert.equal(underscore.courseCode, 'MIVA-PAD 208');

  const tabbed = parsed.entries.find((e) => e.sourceCell === 'C4');
  assert.equal(tabbed.courseCode, 'IFT 410');
  assert.equal(tabbed.courseTitle, 'System Integration and Architecture');

  const combined = parsed.entries.find((e) => e.sourceCell === 'C8');
  assert.deepEqual(combined.courseCodes, ['STA 111', 'MIVA-ECO 105']);
});

test('every normalized entry passes structural validation', () => {
  const { valid, invalid } = validateEntries(parsed.entries);
  assert.deepEqual(invalid, []);
  assert.equal(valid, 18);
});

test('recovers a separator-less course cell at parser level', async () => {
  const wb = await loadWorkbook(await buildRecoveryFixtureBuffer());
  const result = parseWorkbook(wb);

  assert.equal(result.stats.courseCells, 2);
  assert.equal(result.stats.otherCells, 0);
  assert.equal(result.entries.length, 2);

  const recovered = result.entries.find((e) => e.sourceColumn === 'C' && e.sourceRow === 2);
  assert.equal(recovered.courseCode, 'MIVA-PAD 211');
  assert.equal(recovered.courseTitle, 'Foundations of Political Economy');
  assert.deepEqual(recovered.warnings, ['recovered-missing-separator']);
  assert.equal(recovered.date, '2026-10-26');
  assert.equal(recovered.day, 'Monday');
  assert.equal(recovered.startTime, '10:00');

  const warning = result.warnings.find((w) => w.reason === 'recovered-missing-separator');
  assert.equal(warning.row, 2);
  assert.equal(warning.detail, 'MIVA-PAD 211');
});
