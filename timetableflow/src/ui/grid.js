/**
 * Weekly grid model — arranges view-model lessons into a classic timetable:
 * rows = time bands, columns = days, one grid per calendar week.
 *
 * Presentation only. It never decides what a lesson is, whether two lessons
 * conflict, or whether a link is usable: it only places what buildViewModel()
 * already produced. Lessons that overlap in time share a cell (both stay
 * visible), lessons without a time are returned as `unplaced` instead of being
 * dropped.
 */

import { formatDate } from '../render/html.js';

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const HOUR = 60;

const toMinutes = (value) => {
  if (!/^\d{1,2}:\d{2}$/.test(value ?? '')) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};

const toTime = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Monday (ISO week start) of the week containing this date. */
export function mondayOf(date) {
  if (!date) return null;
  const day = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(day.getTime())) return null;
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - sinceMonday);
  return day.toISOString().slice(0, 10);
}

/** Time bands from the earliest start to the latest end, split at least hourly. */
function timeBands(entries) {
  const boundaries = new Set();
  for (const entry of entries) {
    const start = toMinutes(entry.startTime);
    const end = toMinutes(entry.endTime);
    if (start !== null) boundaries.add(start);
    if (end !== null) boundaries.add(end);
  }
  if (!boundaries.size) return [];

  const sorted = [...boundaries].sort((a, b) => a - b);
  const expanded = [sorted[0]];
  for (const boundary of sorted) {
    let current = expanded[expanded.length - 1];
    while (boundary - current > HOUR) {
      current += HOUR;
      expanded.push(current);
    }
    if (boundary !== current) expanded.push(boundary);
  }

  const rows = [];
  for (let index = 0; index < expanded.length - 1; index += 1) {
    rows.push({ start: toTime(expanded[index]), end: toTime(expanded[index + 1]), startMinutes: expanded[index], endMinutes: expanded[index + 1] });
  }
  return rows;
}

function dayIndex(day) {
  const index = DAY_ORDER.indexOf(day);
  return index === -1 ? 7 : index;
}

/** Place one day's lessons into cells of the time bands (overlaps share a cell). */
function placeLessons(entries, rows) {
  const cells = [];
  const unplaced = [];
  const sorted = [...entries].sort((a, b) => {
    const start = (toMinutes(a.startTime) ?? 0) - (toMinutes(b.startTime) ?? 0);
    return start !== 0 ? start : (toMinutes(a.endTime) ?? 0) - (toMinutes(b.endTime) ?? 0);
  });

  let index = 0;
  while (index < sorted.length) {
    const entry = sorted[index];
    const startMinutes = toMinutes(entry.startTime);
    const endMinutes = toMinutes(entry.endTime);
    if (startMinutes === null || endMinutes === null) {
      unplaced.push(entry);
      index += 1;
      continue;
    }

    const group = [entry];
    let groupEnd = endMinutes;
    let next = index + 1;
    while (next < sorted.length) {
      const candidate = sorted[next];
      const candidateStart = toMinutes(candidate.startTime);
      const candidateEnd = toMinutes(candidate.endTime);
      if (candidateStart === null || candidateEnd === null) break;
      if (candidateStart >= groupEnd) break;
      group.push(candidate);
      groupEnd = Math.max(groupEnd, candidateEnd);
      next += 1;
    }

    let rowIdx = rows.findIndex((row) => row.startMinutes <= startMinutes && startMinutes < row.endMinutes);
    if (rowIdx === -1) rowIdx = rows.findIndex((row) => row.startMinutes >= startMinutes);
    if (rowIdx === -1) {
      unplaced.push(...group);
      index = next;
      continue;
    }

    let span = 1;
    while (rowIdx + span < rows.length && rows[rowIdx + span].endMinutes <= groupEnd) span += 1;

    cells.push({ rowIdx, span, entries: group });
    index = next;
  }

  return { cells, unplaced };
}

/**
 * @param {Array} days  viewModel.days
 * @param {{limit?: number|null}} [options]
 * @returns {Array<{key, label, columns, rows, cells, unplaced}>}
 */
export function buildWeeks(days, options = {}) {
  const limited = applyLimit(days ?? [], options.limit);

  const groups = new Map();
  for (const day of limited) {
    const key = mondayOf(day.date) ?? day.date ?? 'unscheduled';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(day);
  }

  const weeks = [...groups.entries()]
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([key, weekDays]) => {
      const ordered = [...weekDays].sort(
        (a, b) => dayIndex(a.day) - dayIndex(b.day) || String(a.date).localeCompare(String(b.date)),
      );
      const allEntries = ordered.flatMap((day) => day.entries);
      const rows = timeBands(allEntries);

      const columns = ordered.map((day, columnIndex) => ({
        key: day.date ?? day.day,
        date: day.date,
        day: day.day,
        columnIndex,
        lessonCount: day.entries.length,
      }));

      const cells = new Map();
      const unplaced = [];
      ordered.forEach((day, columnIndex) => {
        const placed = placeLessons(day.entries, rows);
        for (const cell of placed.cells) cells.set(`${cell.rowIdx}:${columnIndex}`, cell);
        unplaced.push(...placed.unplaced);
      });

      return {
        key,
        label: ordered[0]?.date ? `Week of ${formatDate(ordered[0].date)}` : 'Unscheduled',
        columns,
        rows,
        cells,
        unplaced,
      };
    });

  return weeks;
}

function applyLimit(days, limit) {
  if (!limit) return days;
  const out = [];
  let remaining = limit;
  for (const day of days) {
    if (remaining <= 0) break;
    const entries = day.entries.slice(0, remaining);
    if (!entries.length) break;
    out.push({ ...day, entries });
    remaining -= entries.length;
  }
  return out;
}
