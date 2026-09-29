/**
 * Period selection — a filter/projection over an already-parsed dataset.
 *
 * MIVA ships one workbook that can carry lessons for many months (past and
 * future). The parser extracts ALL of them; this module answers a different
 * question: which slice of that complete dataset does the student want a
 * timetable for?
 *
 * Rules:
 *   - nothing here reads a workbook, a clock or a filename: every period is
 *     derived from parsed entry dates and workbook metadata (sheet names)
 *   - a period only ever SELECTS existing entries — it never creates, merges,
 *     rewrites or re-times a lesson
 *   - the full dataset is never mutated; a projection is a new entry list
 *   - link confidence is untouched: this module filters entries, it never
 *     re-resolves a URL
 */

import { formatDate, MONTH_FULL } from '../render/html.js';
import { courseCatalog } from './selection.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_NAMES_RE = new RegExp(`\\b(${MONTH_FULL.join('|')})\\s+(\\d{4})\\b`, 'i');

/** True for a real, zero-padded ISO calendar date (rejects 2026-02-31 etc.). */
export function isIsoDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

const pad = (value) => String(value).padStart(2, '0');

/** 'YYYY-MM' of an entry date (null when the date is unusable). */
export function monthKeyOf(date) {
  return isIsoDate(date) ? date.slice(0, 7) : null;
}

/** '2026-09' -> 'September 2026' (locale data, never a hard-coded workbook fact). */
export function monthLabel(monthKey) {
  const [year, month] = String(monthKey).split('-').map(Number);
  if (!MONTH_FULL[month - 1]) return String(monthKey);
  return `${MONTH_FULL[month - 1]} ${year}`;
}

/** First and last calendar day of a 'YYYY-MM' month (ISO, inclusive). */
export function monthBounds(monthKey) {
  const [year, month] = String(monthKey).split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { startDate: `${monthKey}-01`, endDate: `${monthKey}-${pad(lastDay)}` };
}

/** Earliest and latest lesson date in a set of entries. */
export function datasetBounds(entries) {
  let firstDate = null;
  let lastDate = null;
  for (const entry of entries ?? []) {
    if (!isIsoDate(entry?.date)) continue;
    if (!firstDate || entry.date < firstDate) firstDate = entry.date;
    if (!lastDate || entry.date > lastDate) lastDate = entry.date;
  }
  return firstDate ? { firstDate, lastDate } : null;
}

/** '14 Sep 2026 – 16 Sep 2026' for a custom range. */
export function rangeLabel(startDate, endDate) {
  return `${formatDate(startDate)} – ${formatDate(endDate)}`;
}

/**
 * Calendar months actually present in the parsed lessons, oldest first.
 * Each option is a real calendar month, but only lessons present in the
 * dataset are ever projected into it.
 *
 * @returns {Array<{id, type:'month', startDate, endDate, label, lessons, courses}>}
 */
export function periodOptions(entries) {
  const groups = new Map();
  for (const entry of entries ?? []) {
    const key = monthKeyOf(entry?.date);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, rows]) => ({
      id: key,
      type: 'month',
      ...monthBounds(key),
      label: monthLabel(key),
      lessons: rows.length,
      courses: courseCatalog(rows).length,
    }));
}

/** The explicit "use every parsed lesson" option (never implied as a default). */
export function allPeriod(entries) {
  const bounds = datasetBounds(entries);
  if (!bounds) return null;
  const rows = entries ?? [];
  return {
    id: 'all',
    type: 'all',
    startDate: bounds.firstDate,
    endDate: bounds.lastDate,
    label: 'All available dates',
    lessons: rows.length,
    courses: courseCatalog(rows).length,
  };
}

/** Resolve a choice made on the period screen ('all' or a 'YYYY-MM' month). */
export function periodById(entries, id) {
  const option = id === 'all' ? allPeriod(entries) : periodOptions(entries).find((item) => item.id === id);
  if (!option) return null;
  const { lessons, courses, ...period } = option;
  return period;
}

/** A student-defined From/To range. */
export function customPeriod(startDate, endDate) {
  return {
    id: `custom:${startDate}..${endDate}`,
    type: 'custom',
    startDate,
    endDate,
    label: rangeLabel(startDate, endDate),
  };
}

/**
 * Why a custom range cannot be used yet.
 * @returns {null | 'missing' | 'invalid' | 'order' | 'outside'}
 */
export function rangeProblem(from, to, bounds) {
  if (!from || !to) return 'missing';
  if (!isIsoDate(from) || !isIsoDate(to)) return 'invalid';
  if (from > to) return 'order';
  if (bounds && (from < bounds.firstDate || to > bounds.lastDate)) return 'outside';
  return null;
}

export function samePeriod(a, b) {
  if (!a || !b) return a === b;
  return a.id === b.id && a.type === b.type && a.startDate === b.startDate && a.endDate === b.endDate;
}

/**
 * Entries inside the period, inclusive on both ends.
 * Entries without a usable date can only belong to the "all" period.
 * Returns the SAME array for 'all' so derived caches keep working.
 */
export function projectEntries(entries, period) {
  if (!Array.isArray(entries) || !period || period.type === 'all') return entries;
  const { startDate, endDate } = period;
  return entries.filter((entry) => isIsoDate(entry?.date) && entry.date >= startDate && entry.date <= endDate);
}

/**
 * fullDataset -> periodDataset. The input dataset is never modified: the
 * projection is a new object whose entries are a subset (or the same array).
 */
export function projectDataset(dataset, period) {
  if (!dataset) return null;
  if (!period || period.type === 'all') return dataset;
  return { ...dataset, entries: projectEntries(dataset.entries, period) };
}

/**
 * The month the workbook itself is "for", read from workbook metadata:
 * the leading parsed month sheet ('<Month> <YYYY> ...'). TIMETABLE_STRUCTURE
 * records that sheet as the workbook's current month. Returns null when the
 * sheet names carry no month — then no provisional claim is ever made.
 */
export function sourceMonthFromDataset(dataset) {
  for (const sheet of dataset?.sheets?.parsed ?? []) {
    const match = MONTH_NAMES_RE.exec(String(sheet?.name ?? ''));
    if (!match) continue;
    const name = match[1].toLowerCase();
    const index = MONTH_FULL.findIndex((month) => month.toLowerCase() === name);
    if (index < 0) continue;
    const monthKey = `${match[2]}-${pad(index + 1)}`;
    return { id: monthKey, type: 'month', ...monthBounds(monthKey), label: monthLabel(monthKey) };
  }
  return null;
}

/**
 * True when the selected period reaches past the workbook's own month, i.e.
 * those lesson dates come from a later part of the workbook than the month the
 * workbook is currently for and may be reissued. Informational only.
 */
export function isProvisionalPeriod(period, sourceMonth) {
  if (!period?.endDate || !sourceMonth?.endDate) return false;
  return period.endDate > sourceMonth.endDate;
}
