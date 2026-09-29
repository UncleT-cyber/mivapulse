/**
 * Calendar export (iCalendar / RFC 5545).
 *
 * Consumes normalized entries (or a student timetable) — never a workbook.
 *
 * Timezone note: the source data carries no timezone, so events are written as
 * FLOATING local times (e.g. DTSTART:20260914T150000) and the consumer's calendar
 * applies its own timezone. No timezone is invented here.
 *
 * Lines are CRLF-terminated and folded at 75 octets as the RFC requires; text
 * values are escaped (\\ \; \, \n).
 */

import { sha256Hex } from './sha256.js';

import { linkState } from '../student/timetable.js';

const CRLF = '\r\n';
const MAX_OCTETS = 75;

export const ICAL_PRODID = '-//TimetableFlow//MIVA Live Lessons//EN';

/** Default reminder: every lesson gets an alarm this many minutes before it starts. */
export const DEFAULT_ALARM_MINUTES = 15;

/**
 * Normalize an alarm option.
 *   undefined -> DEFAULT_ALARM_MINUTES, 0/null -> no alarm, > 0 -> that many minutes
 */
export function normalizeAlarmMinutes(value) {
  if (value === undefined) return DEFAULT_ALARM_MINUTES;
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : null;
}

/** Shared event description: course, optional student, link-state notes. */
export function eventDescription(entry, options = {}) {
  const state = linkState(entry);
  const parts = [`${entry.courseCode} - ${entry.courseTitle}`];
  if (options.student) parts.push(`Student: ${options.student}`);
  if (state === 'needs-verification') parts.push('Lesson link needs verification.');
  if (state === 'missing') parts.push('No live-lesson link yet.');
  return { text: parts.join(' | '), state };
}

/** RFC 5545 text escaping (VALUE=TEXT). */
export function escapeText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Fold one logical line at 75 octets, continuation lines start with a space. */
export function foldLine(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= MAX_OCTETS) return line;

  const decoder = new TextDecoder();
  const chunks = [];
  let start = 0;
  let limit = MAX_OCTETS;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // never split a multi-byte UTF-8 sequence
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    if (end <= start) end = Math.min(start + MAX_OCTETS, bytes.length);
    chunks.push(decoder.decode(bytes.subarray(start, end)));
    start = end;
    limit = MAX_OCTETS - 1; // continuation lines carry one leading space
  }
  return chunks.join(`${CRLF} `);
}

const compactDateTime = (date, time) => `${date.replace(/-/g, '')}T${time.replace(/:/g, '')}00`;

function compactUtcStamp(value) {
  const stamp = value ? new Date(value) : new Date();
  const iso = (Number.isNaN(stamp.getTime()) ? new Date() : stamp).toISOString();
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
}

/**
 * Deterministic UID: same source cell + slot -> same UID on every export.
 * Falls back to course/date/time when the origin is not available.
 */
export function eventUid(entry) {
  const basis = [
    entry.sourceSheet ?? '',
    entry.sourceCell ?? '',
    entry.courseCode ?? '',
    entry.date ?? '',
    entry.startTime ?? '',
    entry.endTime ?? '',
  ].join('|');
  const digest = sha256Hex(basis).slice(0, 32);
  return `${digest}@timetableflow`;
}

/**
 * Map one normalized entry to an iCalendar event.
 * @returns {null|object} null when the entry has no usable date/time
 */
export function entryToEvent(entry, options = {}) {
  if (!entry.date || !entry.startTime || !entry.endTime) return null;

  const description = eventDescription(entry, options);

  const event = {
    uid: eventUid(entry),
    dtStart: compactDateTime(entry.date, entry.startTime),
    dtEnd: compactDateTime(entry.date, entry.endTime),
    summary: `${entry.courseCode} - ${entry.courseTitle}`,
    description: description.text,
    url: description.state === 'verified' ? entry.lessonUrl : null,
    linkState: description.state,
    categories: entry.courseCode,
    alarmMinutes: normalizeAlarmMinutes(options.alarmMinutes),
  };
  return event;
}

/** Render a list of events as an RFC 5545 VCALENDAR document (CRLF line endings). */
export function eventsToICalendar(events, options = {}) {
  const dtStamp = compactUtcStamp(options.dtStamp);
  const calendarName = options.calendarName ?? 'TimetableFlow live lessons';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${ICAL_PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];

  for (const event of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${event.uid}`);
    lines.push(`DTSTAMP:${dtStamp}`);
    lines.push(`DTSTART:${event.dtStart}`);
    lines.push(`DTEND:${event.dtEnd}`);
    lines.push(`SUMMARY:${escapeText(event.summary)}`);
    lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (event.url) lines.push(`URL:${event.url}`);
    lines.push(`CATEGORIES:${escapeText(event.categories)}`);
    lines.push('STATUS:CONFIRMED');
    lines.push(`X-TIMETABLEFLOW-LINK-STATE:${event.linkState}`);
    if (event.alarmMinutes) {
      // VALARM: a display reminder before the lesson starts. Calendar apps turn
      // this into the phone notification the student receives.
      lines.push('BEGIN:VALARM');
      lines.push('ACTION:DISPLAY');
      lines.push(`DESCRIPTION:${escapeText(`${event.summary} starts in ${event.alarmMinutes} minutes`)}`);
      lines.push(`TRIGGER:-PT${event.alarmMinutes}M`);
      lines.push('END:VALARM');
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  return `${lines.map(foldLine).join(CRLF)}${CRLF}`;
}

/**
 * Convenience: normalized entries (or a student timetable's entries) -> .ics text.
 * @returns {{ics: string, events: Array, skipped: Array}}
 */
export function toICalendar(entries, options = {}) {
  const events = [];
  const skipped = [];
  for (const entry of entries) {
    const event = entryToEvent(entry, options);
    if (event) events.push(event);
    else skipped.push(entry);
  }
  return { ics: eventsToICalendar(events, options), events, skipped };
}
