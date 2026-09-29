/**
 * Phase 8.1 — period selection: filter/projection over a parsed dataset.
 *
 * Pure functions over entries: months derived from data, inclusive boundaries,
 * custom ranges, no mutation of the full dataset, and workbook-metadata-based
 * source-month detection. Every fixture uses months/years the real workbook
 * does not contain, so nothing here can pass by accident of hard-coding.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  allPeriod,
  customPeriod,
  datasetBounds,
  isIsoDate,
  isProvisionalPeriod,
  monthBounds,
  monthLabel,
  periodById,
  periodOptions,
  projectDataset,
  projectEntries,
  rangeProblem,
  sourceMonthFromDataset,
} from '../src/student/period.js';
import { makeEntry } from './helpers/entryFactory.js';

/** Lessons spread over three months of a year the reference workbook never uses. */
function sampleEntries() {
  return [
    makeEntry({ courseCode: 'AAA 101', courseTitle: 'Alpha', date: '2031-09-30', startTime: '09:00', endTime: '10:00' }),
    makeEntry({ courseCode: 'BBB 102', courseTitle: 'Beta', date: '2031-10-01', startTime: '10:00', endTime: '11:00' }),
    makeEntry({ courseCode: 'CCC 103', courseTitle: 'Gamma', date: '2031-10-02', startTime: '11:00', endTime: '12:00' }),
    makeEntry({ courseCode: 'DDD 104', courseTitle: 'Delta', date: '2031-10-31', startTime: '12:00', endTime: '13:00' }),
    makeEntry({ courseCode: 'EEE 105', courseTitle: 'Epsilon', date: '2031-11-01', startTime: '13:00', endTime: '14:00' }),
    makeEntry({ courseCode: 'FFF 106', courseTitle: 'Zeta', date: '2031-11-02', startTime: '14:00', endTime: '15:00' }),
  ];
}

const datesOf = (entries) => entries.map((entry) => entry.date);

test('period options are derived from the parsed lessons, month by month', () => {
  const options = periodOptions(sampleEntries());
  assert.deepEqual(
    options.map((option) => [option.id, option.label, option.startDate, option.endDate]),
    [
      ['2031-09', 'September 2031', '2031-09-01', '2031-09-30'],
      ['2031-10', 'October 2031', '2031-10-01', '2031-10-31'],
      ['2031-11', 'November 2031', '2031-11-01', '2031-11-30'],
    ],
    'months come from entry dates, oldest first',
  );
  assert.deepEqual(options.map((option) => option.lessons), [1, 3, 2]);
  assert.deepEqual(options.map((option) => option.courses), [1, 3, 2]);

  assert.equal(monthLabel('2031-02'), 'February 2031');
  assert.deepEqual(monthBounds('2031-02'), { startDate: '2031-02-01', endDate: '2031-02-28' });
  assert.deepEqual(monthBounds('2032-02'), { startDate: '2032-02-01', endDate: '2032-02-29' }, 'leap year handled');
});

test('selecting a month projects exactly that month, inclusive on both ends', () => {
  const entries = sampleEntries();

  const september = projectEntries(entries, periodById(entries, '2031-09'));
  assert.deepEqual(datesOf(september), ['2031-09-30'], 'the month boundary day belongs to the month');

  const october = projectEntries(entries, periodById(entries, '2031-10'));
  assert.deepEqual(datesOf(october), ['2031-10-01', '2031-10-02', '2031-10-31']);

  const november = projectEntries(entries, periodById(entries, '2031-11'));
  assert.deepEqual(datesOf(november), ['2031-11-01', '2031-11-02']);

  assert.deepEqual(projectEntries(entries, periodById(entries, 'nope')), entries,
    'an unknown choice projects nothing new — it is refused before this point');
});

test('a custom range is inclusive and is bounded by the uploaded timetable', () => {
  const entries = sampleEntries();
  const bounds = datasetBounds(entries);
  assert.deepEqual(bounds, { firstDate: '2031-09-30', lastDate: '2031-11-02' });

  assert.equal(rangeProblem('2031-09-30', '2031-10-31', bounds), null);
  assert.deepEqual(
    datesOf(projectEntries(entries, customPeriod('2031-09-30', '2031-10-31'))),
    ['2031-09-30', '2031-10-01', '2031-10-02', '2031-10-31'],
    'start and end are both included',
  );

  assert.equal(rangeProblem('2031-10-31', '2031-10-31', bounds), null, 'a single day is a valid range');
  assert.equal(rangeProblem('', '2031-10-31', bounds), 'missing');
  assert.equal(rangeProblem('2031-10-31', '', bounds), 'missing');
  assert.equal(rangeProblem('2031-02-30', '2031-10-31', bounds), 'invalid', 'impossible dates are refused');
  assert.equal(rangeProblem('nonsense', '2031-10-31', bounds), 'invalid');
  assert.equal(rangeProblem('2031-11-01', '2031-10-01', bounds), 'order', 'from cannot be after to');
  assert.equal(rangeProblem('2031-09-01', '2031-10-31', bounds), 'outside', 'before the timetable starts');
  assert.equal(rangeProblem('2031-09-30', '2031-12-01', bounds), 'outside', 'after the timetable ends');
});

test('"all available dates" is explicit and filters nothing', () => {
  const entries = sampleEntries();
  const all = allPeriod(entries);
  assert.equal(all.type, 'all');
  assert.equal(all.label, 'All available dates');
  assert.deepEqual([all.startDate, all.endDate], ['2031-09-30', '2031-11-02']);
  assert.equal(all.lessons, 6);

  const projected = projectEntries(entries, periodById(entries, 'all'));
  assert.equal(projected, entries, 'the same array — no copy, no filter, caches keep working');
});

test('a period never mutates or destroys the full dataset', () => {
  const dataset = { entries: sampleEntries(), sheets: { parsed: [] } };
  const before = JSON.stringify(dataset.entries);

  const projected = projectDataset(dataset, periodById(dataset.entries, '2031-10'));
  assert.notEqual(projected, dataset, 'the projection is a new dataset object');
  assert.notEqual(projected.entries, dataset.entries, 'with a different entry list');
  assert.equal(JSON.stringify(dataset.entries), before, 'the source entries are byte-identical');
  assert.equal(dataset.entries.length, 6, 'nothing was removed from the full dataset');
  assert.equal(projected.entries.length, 3, 'the projection holds only its own month');

  const allDataset = projectDataset(dataset, periodById(dataset.entries, 'all'));
  assert.equal(allDataset, dataset, '"all" reuses the full dataset as-is');
  assert.equal(projectDataset(null, null), null);
});

test('nothing depends on a particular month or year', () => {
  // Months the reference workbook does not contain at all.
  const january = [
    makeEntry({ courseCode: 'JAN 101', date: '2044-01-05' }),
    makeEntry({ courseCode: 'JAN 102', date: '2044-01-31' }),
  ];
  const february = [makeEntry({ courseCode: 'FEB 101', date: '2044-02-01' })];
  const entries = [...january, ...february];

  assert.deepEqual(periodOptions(entries).map((option) => option.label), ['January 2044', 'February 2044']);
  assert.deepEqual(datesOf(projectEntries(entries, periodById(entries, '2044-01'))), ['2044-01-05', '2044-01-31']);
  assert.deepEqual(datesOf(projectEntries(entries, periodById(entries, '2044-02'))), ['2044-02-01']);
  assert.deepEqual(periodOptions([makeEntry({ date: '1999-12-31' })]).map((option) => option.id), ['1999-12'],
    'even a date before the workbook era works');
});

test('the source month comes from workbook metadata, never from a clock', () => {
  const dataset = { sheets: { parsed: [{ name: 'March 2031 Live Lesson Time' }, { name: 'Live Lessons May 2031' }] } };
  const source = sourceMonthFromDataset(dataset);
  assert.equal(source.id, '2031-03', 'the LEADING month sheet says which month the workbook is for');
  assert.equal(source.label, 'March 2031');
  assert.deepEqual([source.startDate, source.endDate], ['2031-03-01', '2031-03-31']);

  assert.equal(sourceMonthFromDataset({ sheets: { parsed: [] } }), null, 'no sheets -> no claim');
  assert.equal(sourceMonthFromDataset(null), null);
  assert.equal(sourceMonthFromDataset({ sheets: { parsed: [{ name: 'Cohort Grid' }] } }), null,
    'a sheet without a month makes no claim');
});

test('the future-period notice only fires past the workbook month', () => {
  const source = sourceMonthFromDataset({ sheets: { parsed: [{ name: 'March 2031 Live Lesson Time' }] } });

  assert.equal(isProvisionalPeriod({ startDate: '2031-01-01', endDate: '2031-02-28' }, source), false,
    'a period ending before the workbook month is settled history');
  assert.equal(isProvisionalPeriod({ startDate: '2031-03-01', endDate: '2031-03-31' }, source), false,
    'the workbook month itself is what the file is for');
  assert.equal(isProvisionalPeriod({ startDate: '2031-04-01', endDate: '2031-04-30' }, source), true,
    'months after the workbook month may be reissued');
  assert.equal(isProvisionalPeriod({ startDate: '2031-03-15', endDate: '2031-05-01' }, source), true,
    'a custom range that reaches past the workbook month is provisional');
  assert.equal(isProvisionalPeriod({ startDate: '2031-03-01', endDate: '2031-03-31' }, null), false,
    'without metadata no provisional claim is ever made');
  assert.equal(isProvisionalPeriod(null, source), false);
});

test('only real ISO dates are accepted anywhere in the period layer', () => {
  assert.equal(isIsoDate('2031-10-31'), true);
  assert.equal(isIsoDate('2032-02-29'), true, 'a real leap day');
  assert.equal(isIsoDate('2031-02-30'), false, 'an impossible day');
  assert.equal(isIsoDate('2031-13-01'), false);
  assert.equal(isIsoDate('31/10/2031'), false);
  assert.equal(isIsoDate(''), false);
  assert.equal(isIsoDate(null), false);

  const undated = [makeEntry({ date: null }), makeEntry({ date: '2031-10-01' })];
  assert.deepEqual(datesOf(projectEntries(undated, periodById(undated, '2031-10'))), ['2031-10-01'],
    'an undated entry cannot belong to a month');
  assert.equal(projectEntries(undated, allPeriod(undated)).length, 2, 'but "all" still contains it');
  assert.deepEqual(periodOptions(undated).map((option) => option.id), ['2031-10']);
});
