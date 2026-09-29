/**
 * Reminder alarms in the calendar export (VALARM).
 *
 * This is what turns into the phone notification: a display alarm before each
 * lesson. It must be present by default, configurable, and removable — and it
 * must never break the RFC 5545 line folding.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  toICalendar,
  entryToEvent,
  DEFAULT_ALARM_MINUTES,
  normalizeAlarmMinutes,
} from '../src/export/ical.js';
import { makeEntry, makeUnlinkedEntry } from './helpers/entryFactory.js';

const ENTRIES = [
  makeEntry({ date: '2026-09-14', startTime: '15:00', endTime: '16:00' }),
  makeEntry({ date: '2026-09-16', startTime: '17:00', endTime: '18:00', courseCode: 'CSC 101', courseTitle: 'Introduction to Computer Science' }),
];
const DT_STAMP = '2026-09-01T10:00:00.000Z';

test('every event gets a display alarm by default', () => {
  const { ics, events } = toICalendar(ENTRIES, { dtStamp: DT_STAMP });

  assert.equal(DEFAULT_ALARM_MINUTES, 15, 'the default reminder is 15 minutes before');
  assert.equal(ics.split('BEGIN:VALARM').length - 1, events.length, 'one alarm per event');
  assert.equal(ics.split('END:VALARM').length - 1, events.length, 'every alarm is closed');
  assert.ok(ics.includes('ACTION:DISPLAY\r\n'));
  assert.ok(ics.includes(`TRIGGER:-PT${DEFAULT_ALARM_MINUTES}M\r\n`));
  assert.ok(ics.includes('DESCRIPTION:IFT 211 - Digital Logic Design starts in 15 minutes'));
  assert.equal(events[0].alarmMinutes, 15);
});

test('the alarm sits inside its own event, before END:VEVENT', () => {
  const { ics } = toICalendar([ENTRIES[0]], { dtStamp: DT_STAMP });
  const eventEnd = ics.indexOf('END:VEVENT');
  const event = ics.slice(ics.indexOf('BEGIN:VEVENT'), eventEnd);
  assert.ok(event.includes('BEGIN:VALARM'), 'the alarm is inside the event');
  assert.ok(event.indexOf('BEGIN:VALARM') < event.indexOf('END:VALARM'));
  assert.ok(event.indexOf('END:VALARM') === event.length - 'END:VALARM\r\n'.length, 'the alarm closes last');
  assert.ok(ics.indexOf('END:VALARM') < eventEnd, 'the event closes after its alarm');
});

test('the reminder can be changed or switched off', () => {
  const thirty = toICalendar(ENTRIES, { dtStamp: DT_STAMP, alarmMinutes: 30 });
  assert.ok(thirty.ics.includes('TRIGGER:-PT30M\r\n'));
  assert.ok(thirty.ics.includes('starts in 30 minutes'));

  const off = toICalendar(ENTRIES, { dtStamp: DT_STAMP, alarmMinutes: 0 });
  assert.ok(!off.ics.includes('BEGIN:VALARM'), 'no alarm when reminders are off');
  assert.equal(off.events.length, 2, 'switching alarms off changes nothing else');

  const disabled = toICalendar(ENTRIES, { dtStamp: DT_STAMP, alarmMinutes: null });
  assert.ok(!disabled.ics.includes('BEGIN:VALARM'));

  assert.equal(normalizeAlarmMinutes(undefined), DEFAULT_ALARM_MINUTES);
  assert.equal(normalizeAlarmMinutes(10), 10);
  assert.equal(normalizeAlarmMinutes(0), null);
  assert.equal(normalizeAlarmMinutes(-5), null);
  assert.equal(normalizeAlarmMinutes('nope'), null);
});

test('alarms keep every line inside 75 octets after folding', () => {
  const long = makeEntry({ courseTitle: 'Ünicode intro to computing, part one; the very long title '.repeat(3) });
  const { ics } = toICalendar([long], { dtStamp: DT_STAMP });
  for (const line of ics.split('\r\n')) {
    assert.ok(Buffer.byteLength(line, 'utf8') <= 75, `line too long: ${line.slice(0, 40)}…`);
  }
  assert.ok(ics.includes('BEGIN:VALARM'), 'the alarm survives folding');
});

test('entries that are skipped get no alarm either', () => {
  const { events, skipped } = toICalendar([makeUnlinkedEntry({ date: null, startTime: null })], { dtStamp: DT_STAMP });
  assert.equal(events.length, 0);
  assert.equal(skipped.length, 1);
  assert.equal(entryToEvent(makeEntry({ date: null })), null);
});
