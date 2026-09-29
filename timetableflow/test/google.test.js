/**
 * Google Calendar template links — one link per lesson, no file needed.
 *
 * Rules under test: same times as the .ics export (floating, no timezone
 * invented), same link-state rules (only a verified URL ever becomes a link),
 * and nothing rendered for entries without a date/slot.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { googleCalendarUrl, googleLessonLink, isGoogleable } from '../src/export/google.js';
import { makeEntry, makeConflictedEntry, makeUnlinkedEntry } from './helpers/entryFactory.js';

const params = (url) => new URL(url).searchParams;

test('a verified lesson produces a Google Calendar template URL', () => {
  const entry = makeEntry({ date: '2026-09-14', startTime: '15:00', endTime: '16:00' });
  const url = googleCalendarUrl(entry);

  assert.ok(url.startsWith('https://calendar.google.com/calendar/render?'));
  const query = params(url);
  assert.equal(query.get('action'), 'TEMPLATE');
  assert.equal(query.get('text'), 'IFT 211 - Digital Logic Design');
  assert.equal(query.get('dates'), '20260914T150000/20260914T160000', 'floating times, no timezone invented');
  assert.ok(query.get('dates').indexOf('Z') === -1, 'no Z suffix — the source has no timezone');
  assert.ok(query.get('details').includes('IFT 211 - Digital Logic Design'));
  assert.ok(query.get('details').includes(`Join: ${entry.lessonUrl}`), 'verified links are offered to join');
});

test('an ambiguous link stays a note — no candidate URL ever travels', () => {
  const entry = makeConflictedEntry();
  const url = googleCalendarUrl(entry);
  const details = params(url).get('details');

  assert.ok(details.includes('Lesson link needs verification'));
  assert.ok(!details.includes('Join:'), 'an unverified link is never offered as a join link');
  assert.ok(!details.includes('conflict-a'), 'candidate URLs are not exported');
  assert.ok(!details.includes('conflict-b'), 'candidate URLs are not exported');
});

test('a missing link says so instead of pretending', () => {
  const entry = makeUnlinkedEntry();
  const details = params(googleCalendarUrl(entry)).get('details');
  assert.ok(details.includes('No live-lesson link yet.'));
  assert.ok(!details.includes('Join:'));
});

test('the student name flows into the event description', () => {
  const url = googleCalendarUrl(makeEntry(), { student: 'Ada Obi' });
  assert.ok(params(url).get('details').includes('Student: Ada Obi'));
  assert.ok(!params(googleCalendarUrl(makeEntry())).get('details').includes('Student:'));
});

test('entries without a date or slot are not offered a link', () => {
  const noDate = makeEntry({ date: null, startTime: null, endTime: null });
  assert.equal(isGoogleable(noDate), false);
  assert.equal(googleCalendarUrl(noDate), null);
  assert.equal(googleLessonLink(noDate), null);
  assert.equal(isGoogleable(makeEntry()), true);
});

test('the link row carries everything the UI renders', () => {
  const row = googleLessonLink(makeEntry({ date: '2026-09-16', day: 'Wednesday' }), { student: 'Ada' });
  assert.equal(row.courseCode, 'IFT 211');
  assert.equal(row.courseTitle, 'Digital Logic Design');
  assert.equal(row.date, '2026-09-16');
  assert.equal(row.day, 'Wednesday');
  assert.equal(row.startTime, '15:00');
  assert.equal(row.endTime, '16:00');
  assert.equal(row.linkState, 'verified');
  assert.ok(row.href.includes('calendar.google.com/calendar/render'));
});

test('the same entry always produces the same link', () => {
  const entry = makeEntry();
  assert.equal(googleCalendarUrl(entry), googleCalendarUrl({ ...entry }));
  assert.notEqual(googleCalendarUrl(entry), googleCalendarUrl(makeEntry({ date: '2026-09-15' })));
});
