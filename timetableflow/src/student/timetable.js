/**
 * Student timetable — selection in, chronological view + conflicts + summary out.
 *
 * Operates exclusively on normalized entries (Phase 5 output). Nothing here reads
 * a workbook, a sheet name or a cell address: the Excel boundary stops at the
 * parser.
 */

import { stripMivaPrefix, normalizeCourseCode } from '../parser/courseCell.js';

export const LINK_STATES = ['verified', 'needs-verification', 'missing'];

/** Why a lesson is held back from `verified` — the public state stays three-valued. */
export const LINK_REASONS = ['conflicting-candidates', 'title-only-match', 'title-mismatch'];

// tolerant of both the full entry and the flat dataset projection
const hasConflictingCandidates = (entry) =>
  Boolean(entry.match?.ambiguous || entry.match?.conflict || entry.ambiguous === true || entry.conflict);
const isTitleOnlyMatch = (entry) => entry.match?.rule === 'course-title-fallback';
const hasTitleMismatch = (entry) => entry.match?.titleMismatch === true;

/**
 * Link confidence for the UI:
 *   verified            — a deterministic identity match (code, MIVA- variant or
 *                         slash part) AND no contradictory metadata: exactly one
 *                         URL and a link row whose title agrees with the
 *                         timetable's course title
 *   needs-verification  — a URL exists but a contradiction remains (title-only
 *                         match, title disagreement) or the code maps to more
 *                         than one URL (NSC 309). The joined URL is kept as
 *                         evidence and never presented as resolved.
 *   missing             — no lesson URL could be joined
 */
export function linkState(entry) {
  if (hasConflictingCandidates(entry)) return 'needs-verification';
  if (!entry.lessonUrl) return 'missing';
  if (isTitleOnlyMatch(entry) || hasTitleMismatch(entry)) return 'needs-verification';
  return 'verified';
}

/** The contradiction behind `needs-verification`, or null for verified/missing. */
export function linkStateReason(entry) {
  if (linkState(entry) !== 'needs-verification') return null;
  if (hasConflictingCandidates(entry)) return 'conflicting-candidates';
  if (isTitleOnlyMatch(entry)) return 'title-only-match';
  return 'title-mismatch';
}

const timeOrEmpty = (value) => value ?? '';

function compareEntries(a, b) {
  const dateA = a.date ?? '';
  const dateB = b.date ?? '';
  if (dateA !== dateB) return dateA < dateB ? -1 : 1;

  const startA = timeOrEmpty(a.startTime);
  const startB = timeOrEmpty(b.startTime);
  if (startA !== startB) return startA < startB ? -1 : 1;

  const endA = timeOrEmpty(a.endTime);
  const endB = timeOrEmpty(b.endTime);
  if (endA !== endB) return endA < endB ? -1 : 1;

  const codeA = a.courseCode ?? '';
  const codeB = b.courseCode ?? '';
  if (codeA !== codeB) return codeA < codeB ? -1 : 1;

  const originA = `${a.sourceSheet ?? ''}!${a.sourceColumn ?? ''}${a.sourceRow ?? 0}`;
  const originB = `${b.sourceSheet ?? ''}!${b.sourceColumn ?? ''}${b.sourceRow ?? 0}`;
  if (originA !== originB) return originA < originB ? -1 : 1;
  return 0;
}

const minutes = (hhmm) => {
  if (!/^\d{2}:\d{2}$/.test(hhmm ?? '')) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

function toMinutesRange(entry) {
  const start = minutes(entry.startTime);
  const end = minutes(entry.endTime);
  if (start === null || end === null || end <= start) return null;
  return [start, end];
}

/** All overlapping pairs per day (small n, exact pair-wise check). */
function detectConflicts(days) {
  const conflicts = [];
  for (const day of days) {
    if (!day.date) continue; // undated entries cannot clash with anything
    const dated = day.entries.filter((entry) => toMinutesRange(entry));
    for (let i = 0; i < dated.length; i += 1) {
      for (let j = i + 1; j < dated.length; j += 1) {
        const [startA, endA] = toMinutesRange(dated[i]);
        const [startB, endB] = toMinutesRange(dated[j]);
        const overlap = Math.min(endA, endB) - Math.max(startA, startB);
        if (overlap > 0) {
          conflicts.push({
            date: day.date,
            day: day.day,
            overlapMinutes: overlap,
            entries: [dated[i], dated[j]].map((entry) => ({
              courseCode: entry.courseCode,
              courseTitle: entry.courseTitle,
              startTime: entry.startTime,
              endTime: entry.endTime,
              linkState: linkState(entry),
            })),
          });
        }
      }
    }
  }
  return conflicts;
}

function groupByDay(sorted) {
  const days = [];
  let current = null;
  let currentKey = null;
  for (const entry of sorted) {
    const key = entry.date ?? 'undated';
    if (!current || currentKey !== key) {
      current = {
        date: entry.date ?? null,
        day: entry.day ?? null,
        dayRaw: entry.dayRaw ?? null,
        weekIndex: entry.weekIndex ?? null,
        entries: [],
      };
      days.push(current);
      currentKey = key;
    }
    current.entries.push(entry);
  }
  return days;
}

function summarize(entries, days, conflicts) {
  const courseCodes = [...new Set(entries.map((e) => stripMivaPrefix(normalizeCourseCode(e.courseCode))))].sort();
  const dates = entries.map((e) => e.date).filter(Boolean).sort();
  const states = { verified: 0, 'needs-verification': 0, missing: 0 };
  for (const entry of entries) states[linkState(entry)] += 1;

  return {
    courses: courseCodes.length,
    courseCodes,
    lessons: entries.length,
    days: days.length,
    firstDate: dates[0] ?? null,
    lastDate: dates.at(-1) ?? null,
    linkStates: states,
    conflictPairs: conflicts.length,
  };
}

/**
 * @param {Array} entries  normalized (already selected) entries
 * @param {{student?: string|null, selection?: string[], generatedAt?: string}} [options]
 * @returns {{student: string|null, generatedAt: string|null, selection: string[],
 *            entries: Array, days: Array, conflicts: Array, summary: object}}
 */
export function buildStudentTimetable(entries, options = {}) {
  const sorted = [...entries].sort(compareEntries);
  const days = groupByDay(sorted);
  const conflicts = detectConflicts(days);

  return {
    student: options.student ?? null,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    selection: options.selection ?? [],
    entries: sorted,
    days,
    conflicts,
    summary: summarize(sorted, days, conflicts),
  };
}
