/**
 * Course selection — turns a student's course picks into timetable entries.
 *
 * Consumes NORMALIZED entries only (the output of the parser/resolver). No Excel
 * knowledge lives here: `sourceSheet` / `sourceCell` are never touched.
 *
 * Matching rule (deterministic, same spirit as the resolver — no fuzzy titles):
 *   a selected code matches an entry when their canonical code sets intersect
 *   - canonical form  : normalizeCourseCode  (case, '_', 'MIVA '/'MIVA-' prefix)
 *   - prefix tolerance: both sides also compared with the MIVA- prefix stripped
 *   - slash codes     : each half compared on its own in both directions
 *     (select 'INS 204'  -> entries 'INS 204/MIVA-IFT 204')
 *     (select 'BUA 203/ENT 125' -> entries coded 'BUA 203/ENT 125' or 'BUA 203')
 *   Titles are reported for display but NEVER used to decide a match.
 */

import { normalizeCourseCode, splitCourseCodes, stripMivaPrefix } from '../parser/courseCell.js';

/** Canonical, de-duplicated, order-preserving selection list. */
export function normalizeSelection(codes) {
  const seen = new Set();
  const out = [];
  for (const raw of codes ?? []) {
    if (raw === null || raw === undefined) continue;
    const text = String(raw).trim();
    if (!text) continue;
    const canonical = normalizeCourseCode(text);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    out.push({ input: text, normalized: canonical });
  }
  return out;
}

function keysFor(code) {
  const canonical = normalizeCourseCode(code);
  const keys = [canonical, stripMivaPrefix(canonical)];
  for (const part of splitCourseCodes(canonical)) {
    keys.push(part, stripMivaPrefix(part));
  }
  return keys.filter(Boolean);
}

function entryKeySet(entry) {
  const keys = new Set();
  if (entry.courseCode) for (const key of keysFor(entry.courseCode)) keys.add(key);
  for (const part of entry.courseCodes ?? []) {
    for (const key of keysFor(part)) keys.add(key);
  }
  return keys;
}

function selectionKeySet(code) {
  return new Set(keysFor(code));
}

/** Distinct normalized titles seen for a set of entries. */
function titlesOf(entries) {
  const titles = [];
  const seen = new Set();
  for (const entry of entries) {
    const title = entry.courseTitle?.trim();
    if (!title) continue;
    const key = title.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    titles.push(title);
  }
  return titles;
}

/**
 * Build the course catalogue a student picks from (derived from normalized data).
 * @returns {Array<{courseCodes: string[], titles: string[], lessons: number, firstDate: string|null, lastDate: string|null}>}
 */
export function courseCatalog(entries) {
  const byKey = new Map();
  for (const entry of entries) {
    const key = stripMivaPrefix(normalizeCourseCode(entry.courseCode));
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(entry);
  }
  return [...byKey.entries()]
    .map(([key, rows]) => ({
      courseCode: key,
      altCodes: [...new Set(rows.map((r) => r.courseCode))].sort(),
      titles: titlesOf(rows),
      lessons: rows.length,
      firstDate: rows.map((r) => r.date).filter(Boolean).sort()[0] ?? null,
      lastDate: rows.map((r) => r.date).filter(Boolean).sort().at(-1) ?? null,
    }))
    .sort((a, b) => a.courseCode.localeCompare(b.courseCode));
}

/**
 * @param {Array} entries  normalized TimetableFlow entries
 * @param {string[]} selection  course codes the student picked
 * @returns {{requested: Array, unmatched: Array, entries: Array, courses: Array, stats: object}}
 */
export function selectCourses(entries, selection) {
  const requested = normalizeSelection(selection);
  const requestedWithKeys = requested.map((item) => ({ ...item, keys: selectionKeySet(item.normalized) }));

  const matchedEntries = [];
  const perSelection = requestedWithKeys.map((item) => ({ ...item, rows: [] }));

  for (const entry of entries) {
    const entryKeys = entryKeySet(entry);
    const hits = perSelection.filter((item) => [...item.keys].some((key) => entryKeys.has(key)));
    if (!hits.length) continue;
    matchedEntries.push(entry);
    for (const hit of hits) hit.rows.push(entry);
  }

  const courses = perSelection.map((item) => ({
    input: item.input,
    normalized: item.normalized,
    matched: item.rows.length > 0,
    courseCodes: [...new Set(item.rows.map((r) => r.courseCode))].sort(),
    titles: titlesOf(item.rows),
    lessons: item.rows.length,
    firstDate: item.rows.map((r) => r.date).filter(Boolean).sort()[0] ?? null,
    lastDate: item.rows.map((r) => r.date).filter(Boolean).sort().at(-1) ?? null,
  }));

  const unmatched = courses
    .filter((course) => !course.matched)
    .map((course) => ({ input: course.input, normalized: course.normalized }));

  return {
    requested,
    courses,
    unmatched,
    entries: matchedEntries,
    stats: {
      requested: requested.length,
      matchedCourses: courses.filter((c) => c.matched).length,
      unmatchedCourses: unmatched.length,
      lessons: matchedEntries.length,
    },
  };
}
