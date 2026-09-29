import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  toICalendar,
  eventsToICalendar,
  entryToEvent,
  eventUid,
  foldLine,
  escapeText,
  ICAL_PRODID,
} from '../src/export/ical.js';
import { makeEntry, makeConflictedEntry, makeUnlinkedEntry } from './helpers/entryFactory.js';

const ENTRIES = [
  makeEntry({ date: '2026-09-14', startTime: '15:00', endTime: '16:00', courseCode: 'IFT 211', courseTitle: 'Digital Logic Design' }),
  makeEntry({ date: '2026-09-16', startTime: '15:00', endTime: '16:00', courseCode: 'ACC 101', courseTitle: 'Introduction to Accounting, I; Part One' }),
  makeConflictedEntry({ date: '2026-09-16', startTime: '17:00', endTime: '18:00' }),
  makeUnlinkedEntry({ date: '2026-09-22', startTime: '15:00', endTime: '16:00', courseCode: 'PAD 302' }),
];

const DT_STAMP = '2026-09-01T10:00:00.000Z';

test('text values are escaped per RFC 5545', () => {
  assert.equal(escapeText('a,b;c\\d'), 'a\\,b\\;c\\\\d');
  assert.equal(escapeText('line1\nline2'), 'line1\\nline2');
});

test('folding keeps every line within 75 octets and preserves content', () => {
  const line = `DESCRIPTION:${'Ünicode text that keeps going and going '.repeat(6)}`;
  const folded = foldLine(line);
  for (const part of folded.split('\r\n')) {
    assert.ok(Buffer.byteLength(part, 'utf8') <= 75, `line too long: ${Buffer.byteLength(part)}`);
  }
  assert.ok(folded.includes('\r\n '));
  assert.equal(folded.replace(/\r\n /g, ''), line);
  assert.equal(foldLine('SHORT:yes'), 'SHORT:yes');
});

test('the calendar uses CRLF endings everywhere and a valid envelope', () => {
  const { ics, events, skipped } = toICalendar(ENTRIES, { dtStamp: DT_STAMP, calendarName: 'Ada lessons' });

  assert.equal(events.length, 4);
  assert.equal(skipped.length, 0);

  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(ics.includes(`PRODID:${ICAL_PRODID}\r\n`));
  assert.ok(ics.includes('VERSION:2.0\r\n'));
  assert.ok(ics.includes('X-WR-CALNAME:Ada lessons\r\n'));

  // every LF must be preceded by CR
  const bareLf = ics.split('\n').filter((part, index, all) => index < all.length - 1 && !part.endsWith('\r'));
  assert.deepEqual(bareLf, []);

  assert.equal(ics.split('BEGIN:VEVENT').length - 1, 4);
  assert.equal(ics.split('END:VEVENT').length - 1, 4);
});

test('events carry floating local start/end times and deterministic UIDs', () => {
  const { ics } = toICalendar(ENTRIES, { dtStamp: DT_STAMP });
  assert.ok(ics.includes('DTSTART:20260914T150000\r\n'));
  assert.ok(ics.includes('DTEND:20260914T160000\r\n'));
  assert.ok(ics.includes('DTSTAMP:20260901T100000Z\r\n'));

  const first = eventUid(ENTRIES[0]);
  const again = eventUid({ ...ENTRIES[0] });
  const other = eventUid(ENTRIES[1]);
  assert.equal(first, again);
  assert.notEqual(first, other);
  assert.ok(first.endsWith('@timetableflow'));

  const uids = [...ics.matchAll(/^UID:(.+)$/gm)].map((m) => m[1]);
  assert.equal(new Set(uids).size, uids.length);
});

test('special characters in titles reach the file escaped, not raw', () => {
  const { ics } = toICalendar(ENTRIES, { dtStamp: DT_STAMP });
  const summaryLine = ics.split('\r\n').find((line) => line.startsWith('SUMMARY:ACC'));
  assert.equal(summaryLine, 'SUMMARY:ACC 101 - Introduction to Accounting\\, I\\; Part One');
});

test('verified links become URL properties, conflicted/missing links do not', () => {
  const { ics, events } = toICalendar(ENTRIES, { dtStamp: DT_STAMP });
  const unfolded = ics.replace(/\r\n /g, ''); // content checks ignore RFC 5545 folding

  const [okEvent, conflictEvent, missingEvent] = [
    events.find((e) => e.summary.startsWith('IFT 211')),
    events.find((e) => e.linkState === 'needs-verification'),
    events.find((e) => e.linkState === 'missing'),
  ];

  assert.equal(okEvent.url, ENTRIES[0].lessonUrl);
  assert.ok(ics.includes(`URL:${ENTRIES[0].lessonUrl}\r\n`));
  assert.equal(conflictEvent.url, null);
  assert.equal(missingEvent.url, null);

  assert.ok(ics.includes('X-TIMETABLEFLOW-LINK-STATE:verified\r\n'));
  assert.ok(ics.includes('X-TIMETABLEFLOW-LINK-STATE:needs-verification\r\n'));
  assert.ok(ics.includes('X-TIMETABLEFLOW-LINK-STATE:missing\r\n'));
  assert.ok(unfolded.includes('DESCRIPTION:NSC 309 - Nursing Ethics and Jurisprudence'));
  assert.ok(unfolded.includes('Lesson link needs verification.'));
  assert.ok(unfolded.includes('No live-lesson link yet.'));
});

test('entries without a date or slot are skipped rather than guessed', () => {
  const { events, skipped } = toICalendar([makeEntry({ date: null, startTime: null })], { dtStamp: DT_STAMP });
  assert.equal(events.length, 0);
  assert.equal(skipped.length, 1);
  assert.equal(entryToEvent(makeEntry({ date: null })), null);
});

test('an explicit calendar name and student are honoured', () => {
  const { ics } = toICalendar([ENTRIES[0]], { dtStamp: DT_STAMP, student: 'Ada Obi', calendarName: 'Ada, live lessons' });
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(ics.includes('X-WR-CALNAME:Ada\\, live lessons\r\n'));
  assert.ok(unfolded.includes('Student: Ada Obi')); // ':' needs no escaping in TEXT
});

test('eventsToICalendar renders an empty calendar without events', () => {
  const ics = eventsToICalendar([], { dtStamp: DT_STAMP });
  assert.equal(ics.split('BEGIN:VEVENT').length, 1);
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});
