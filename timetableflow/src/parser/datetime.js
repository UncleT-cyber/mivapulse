/**
 * Day / date / time normalization.
 *
 * Source of truth: TIMETABLE_STRUCTURE.md §4.
 *  - no real date or time values exist in the workbook; everything is free text
 *  - day label lives in column B: 'Monday 14/09/2026', 'Wednessday\n16/09/2026', …
 *  - the weekday word is misspelled ('Wednessday') and separated by spaces/newlines
 *  - slot times live in the weekly header row: '3:00 - 4:00 pm' / '1:30 - 3:00 pm'
 */

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const DAY_PREFIXES = {
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  thr: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
};

export const DAY_LABEL_PATTERN =
  /^\s*(Monday|Tuesday|Wednessday|Wednesday|Thrusday|Thursday|Friday|Sunday|Saturday)\b/i;

const DATE_PATTERN = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;

const SLOT_PATTERN = /^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*(am|pm)?\s*$/i;

/** True when the text looks like a day label ('Monday…'). Marker cells such as '-' do not. */
export function looksLikeDayLabel(value) {
  if (typeof value !== 'string') return false;
  return DAY_LABEL_PATTERN.test(value);
}

/** True when the text looks like a time-slot header ('3:00 - 4:00 pm'). */
export function looksLikeSlotHeader(value) {
  if (typeof value !== 'string') return false;
  return SLOT_PATTERN.test(value);
}

/**
 * Canonical English weekday for any observed spelling, including the source typo
 * 'Wednessday'. Returns null when the word is not a weekday.
 */
export function normalizeDayName(rawValue) {
  if (typeof rawValue !== 'string') return null;
  const word = rawValue.trim().toLowerCase();
  if (!word) return null;
  return DAY_PREFIXES[word.slice(0, 3)] ?? null;
}

const pad = (n) => String(n).padStart(2, '0');

/**
 * @returns {{dayRaw: string, day: string|null, date: string|null, dateParts: {day:number,month:number,year:number}|null,
 *            weekdayMatchesDate: boolean|null, warnings: string[]}}
 */
export function parseDayLabel(rawValue) {
  const dayRaw = typeof rawValue === 'string' ? rawValue : '';
  const warnings = [];
  const day = normalizeDayName(dayRaw);

  if (!day) warnings.push('unrecognized-day-name');

  const dateMatch = DATE_PATTERN.exec(dayRaw);
  let date = null;
  let dateParts = null;
  let weekdayMatchesDate = null;

  if (dateMatch) {
    const [, d, m, y] = dateMatch;
    const dayNum = Number(d);
    const monthNum = Number(m);
    const yearNum = Number(y);
    if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31) {
      const utc = new Date(Date.UTC(yearNum, monthNum - 1, dayNum));
      if (
        utc.getUTCFullYear() === yearNum &&
        utc.getUTCMonth() === monthNum - 1 &&
        utc.getUTCDate() === dayNum
      ) {
        date = `${yearNum}-${pad(monthNum)}-${pad(dayNum)}`;
        dateParts = { day: dayNum, month: monthNum, year: yearNum };
        if (day) {
          weekdayMatchesDate = DAY_NAMES[utc.getUTCDay()] === day;
          if (!weekdayMatchesDate) warnings.push('weekday-date-mismatch');
        }
      } else {
        warnings.push('invalid-date');
      }
    } else {
      warnings.push('invalid-date');
    }
  } else if (day) {
    warnings.push('day-label-without-date');
  }

  return { dayRaw, day, date, dateParts, weekdayMatchesDate, warnings };
}

function applyMeridiem(hour, meridiem) {
  if (!meridiem) return hour;
  const m = meridiem.toLowerCase();
  if (m === 'pm') return hour === 12 ? 12 : hour < 12 ? hour + 12 : hour;
  return hour === 12 ? 0 : hour;
}

/**
 * Parse a slot header such as '3:00 - 4:00 pm' or '1:30 - 3:00 pm'.
 * Returns 24h 'HH:MM' bounds. When the meridiem would make the end <= start
 * (e.g. '11:00 - 12:00 pm') the start is shifted back twelve hours.
 *
 * @returns {{ok: true, slotLabel: string, startTime: string, endTime: string, warnings: string[]}
 *          | {ok: false, reason: string, slotLabel: string}}
 */
export function parseSlotLabel(rawValue) {
  const slotLabel = typeof rawValue === 'string' ? rawValue.trim() : '';
  const match = SLOT_PATTERN.exec(slotLabel);
  if (!match) return { ok: false, reason: 'not-a-slot-header', slotLabel };

  const warnings = [];
  const meridiem = match[5] ?? null;
  if (!meridiem) warnings.push('slot-without-meridiem');

  let startMinutes = applyMeridiem(Number(match[1]), meridiem) * 60 + Number(match[2]);
  let endMinutes = applyMeridiem(Number(match[3]), meridiem) * 60 + Number(match[4]);

  if (endMinutes <= startMinutes) {
    if (startMinutes >= 12 * 60) startMinutes -= 12 * 60;
    else endMinutes += 12 * 60;
    warnings.push('slot-bounds-adjusted');
  }
  if (endMinutes <= startMinutes) {
    return { ok: false, reason: 'invalid-slot-bounds', slotLabel };
  }

  const toClock = (total) => `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
  return {
    ok: true,
    slotLabel,
    startTime: toClock(startMinutes),
    endTime: toClock(endMinutes),
    warnings,
  };
}

/**
 * Week labels are unreliable free text ('Week 2 starting 23th  Novermber').
 * We keep them verbatim and derive the week index from order of appearance.
 */
export function looksLikeWeekLabel(value) {
  return typeof value === 'string' && /^\s*Week\s*\d+/i.test(value);
}
