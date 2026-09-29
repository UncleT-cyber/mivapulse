import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  looksLikeDayLabel,
  looksLikeSlotHeader,
  looksLikeWeekLabel,
  normalizeDayName,
  parseDayLabel,
  parseSlotLabel,
} from '../src/parser/datetime.js';

test('day label detection', () => {
  assert.equal(looksLikeDayLabel('Monday 14/09/2026'), true);
  assert.equal(looksLikeDayLabel('Wednessday\n16/09/2026'), true);
  assert.equal(looksLikeDayLabel('Friday\n 25/09/2026'), true);
  assert.equal(looksLikeDayLabel('-'), false);
  assert.equal(looksLikeDayLabel('3:00 - 4:00 pm'), false);
  assert.equal(looksLikeDayLabel(null), false);
});

test('weekday names including observed typos', () => {
  assert.equal(normalizeDayName('Monday'), 'Monday');
  assert.equal(normalizeDayName('  wednessday '), 'Wednesday');
  assert.equal(normalizeDayName('Thrusday'), 'Thursday');
  assert.equal(normalizeDayName('Week 1 starting 14th September'), null);
});

test('parses day label into ISO date + weekday check', () => {
  const result = parseDayLabel('Monday 14/09/2026');
  assert.equal(result.day, 'Monday');
  assert.equal(result.date, '2026-09-14');
  assert.equal(result.weekdayMatchesDate, true);
  assert.deepEqual(result.warnings, []);
});

test('parses a newline-separated, misspelled day label', () => {
  const result = parseDayLabel('Wednessday\n16/09/2026');
  assert.equal(result.day, 'Wednesday');
  assert.equal(result.date, '2026-09-16');
  assert.equal(result.weekdayMatchesDate, true);
});

test('flags a weekday that contradicts the date', () => {
  const result = parseDayLabel('Monday 16/09/2026');
  assert.equal(result.date, '2026-09-16');
  assert.equal(result.weekdayMatchesDate, false);
  assert.ok(result.warnings.includes('weekday-date-mismatch'));
});

test('flags impossible dates', () => {
  const result = parseDayLabel('Monday 31/02/2026');
  assert.equal(result.date, null);
  assert.ok(result.warnings.includes('invalid-date'));
});

test('slot header detection', () => {
  assert.equal(looksLikeSlotHeader('3:00 - 4:00 pm'), true);
  assert.equal(looksLikeSlotHeader('1:30 - 3:00 pm'), true);
  assert.equal(looksLikeSlotHeader('IFT 211 - Digital Logic Design'), false);
  assert.equal(looksLikeSlotHeader(null), false);
});

test('parses pm slots to 24h bounds', () => {
  const morning = parseSlotLabel('10:00 - 11:00 am');
  assert.equal(morning.startTime, '10:00');
  assert.equal(morning.endTime, '11:00');

  const afternoon = parseSlotLabel('3:00 - 4:00 pm');
  assert.equal(afternoon.startTime, '15:00');
  assert.equal(afternoon.endTime, '16:00');

  const revision = parseSlotLabel('1:30 - 3:00 pm');
  assert.equal(revision.startTime, '13:30');
  assert.equal(revision.endTime, '15:00');
});

test('adjusts a slot whose meridiem would invert it', () => {
  const result = parseSlotLabel('11:00 - 12:00 pm');
  assert.equal(result.ok, true);
  assert.equal(result.startTime, '11:00');
  assert.equal(result.endTime, '12:00');
  assert.ok(result.warnings.includes('slot-bounds-adjusted'));
});

test('rejects a non-slot string', () => {
  const result = parseSlotLabel('Digital Logic Design');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not-a-slot-header');
});

test('week label detection tolerates typos and spacing', () => {
  assert.equal(looksLikeWeekLabel('Week 1 starting 14th September'), true);
  assert.equal(looksLikeWeekLabel('Week 2 starting 21st  September'), true);
  assert.equal(looksLikeWeekLabel('23th Novermber'), false);
  assert.equal(looksLikeWeekLabel('Week1'), true);
});
