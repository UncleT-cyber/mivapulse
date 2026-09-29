/**
 * Google Calendar "add this single lesson" links.
 *
 * Google has no API for importing a whole file through a URL, so each lesson
 * gets its own template link (no file download needed on phones). The link is
 * built from the same normalized entry the .ics export uses — no second
 * timetable model, no duplicated link rules (eventDescription / linkState).
 *
 * Times are FLOATING (no Z suffix), matching the .ics export: the source data
 * carries no timezone, so the student's own calendar applies its timezone.
 */

import { eventDescription } from './ical.js';

const GOOGLE_RENDER = 'https://calendar.google.com/calendar/render';

const compactDateTime = (date, time) => `${date.replace(/-/g, '')}T${time.replace(/:/g, '')}00`;

/** True when this lesson can be turned into a Google Calendar event. */
export function isGoogleable(entry) {
  return Boolean(entry?.date && entry?.startTime && entry?.endTime);
}

/**
 * @param {object} entry normalized entry (or student timetable entry)
 * @param {{student?: string|null}} [options]
 * @returns {string|null} Google Calendar template URL, or null when the entry
 *   has no usable date/time
 */
export function googleCalendarUrl(entry, options = {}) {
  if (!isGoogleable(entry)) return null;

  const description = eventDescription(entry, options);
  const parts = [description.text];
  // only a verified link is ever put into the event: an ambiguous or missing
  // link stays a note (exactly like the .ics URL property)
  if (description.state === 'verified' && entry.lessonUrl) parts.push(`Join: ${entry.lessonUrl}`);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${entry.courseCode} - ${entry.courseTitle}`,
    dates: `${compactDateTime(entry.date, entry.startTime)}/${compactDateTime(entry.date, entry.endTime)}`,
    details: parts.join('\n'),
  });

  return `${GOOGLE_RENDER}?${params.toString()}`;
}

/** One lesson -> the fields the UI needs to render a link row. */
export function googleLessonLink(entry, options = {}) {
  if (!isGoogleable(entry)) return null;
  return {
    courseCode: entry.courseCode,
    courseTitle: entry.courseTitle,
    date: entry.date,
    day: entry.day,
    startTime: entry.startTime,
    endTime: entry.endTime,
    linkState: eventDescription(entry, options).state,
    href: googleCalendarUrl(entry, options),
  };
}
