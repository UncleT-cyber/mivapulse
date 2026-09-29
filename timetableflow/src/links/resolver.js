/**
 * Course matcher / lesson-link resolver.
 *
 * Joins the SCHEDULE source (month timetable sheets) with the LINK source
 * (`Live Lesson Links`) in a deterministic, documented fallback order:
 *
 *   1. tier 'exact'      – the entry's canonical course-code key is present in the
 *                           link index (the index stores each link row under its full
 *                           code, its MIVA-stripped form and each slash part)
 *   2. tier 'normalized' – MIVA- prefix stripped form of the entry code matches
 *                           (timetable 'MIVA-ECO 313' <-> links 'ECO 313')
 *   3. tier 'variant'    – slash-combined codes matched part by part in either
 *                           direction, plus approved spelling variants
 *                           (timetable 'STA 111/ MIVA-ECO 105' <-> links 'STA 111/MIVA ECO 105',
 *                            timetable 'MIVA_PAD 208'          <-> links 'MIVA-PAD 208')
 *   4. tier 'title'      – course-title fallback for miscoded cells
 *                           (timetable 'CSC 101 - Introduction to Criminology…'
 *                            <-> links 'CSS 101' with that exact title)
 *
 * `match.tier` reproduces the validated reconnaissance baseline; `match.rule` names
 * the concrete mechanism that produced the hit (e.g. the entry code is one half of a
 * combined links code). No generic fuzzy matching is used anywhere.
 *
 * Conflicts are never silently resolved: if a code maps to more than one distinct
 * URL (reference file: NSC 309), `lessonUrl` stays null and the candidates are
 * attached so the application can surface them for review.
 */

import { collapseWhitespace, stripMivaPrefix } from '../parser/courseCell.js';

export const MATCH_TIERS = ['exact', 'normalized', 'variant', 'title', 'none'];

export const MATCH_RULES = {
  EXACT: 'exact-course-code',
  PREFIX: 'miva-prefix-stripped-course-code',
  COMBINED: 'combined-course-code-part',
  SPELLING: 'approved-code-spelling-variant',
  TITLE: 'course-title-fallback',
  NONE: 'no-match',
};

function uniqueByRow(records) {
  const seen = new Map();
  for (const record of records) {
    if (!seen.has(record.row)) seen.set(record.row, record);
  }
  return [...seen.values()];
}

function toCandidates(records) {
  return uniqueByRow(records).map((record) => ({
    row: record.row,
    courseCode: record.courseCode,
    courseTitle: record.courseTitle,
    url: record.url,
    urlSource: record.urlSource,
  }));
}

function lookup(linkIndex, keys) {
  for (const key of keys) {
    if (!key) continue;
    const bucket = linkIndex.byCode.get(key);
    if (bucket && bucket.length) return { key, records: bucket };
  }
  return null;
}

function slashParts(code) {
  return String(code)
    .split('/')
    .map((part) => stripMivaPrefix(part))
    .filter(Boolean);
}

/** The entry code is one half of a combined code (either side carries the '/'). */
function hasCombinedPart(record, code) {
  if (!record.courseCode.includes('/') && !String(code).includes('/')) return false;
  const linkParts = new Set(slashParts(record.courseCode));
  return slashParts(code).some((part) => linkParts.has(part));
}

/** Which concrete mechanism produced the hit (documentation-grade detail). */
function describeRule(tier, code, candidates) {
  if (tier === 'none') return MATCH_RULES.NONE;
  if (tier === 'title') return MATCH_RULES.TITLE;

  const exactPrimary = candidates.some((c) => c.courseCode === code);
  const combinedPart = candidates.some((c) => hasCombinedPart(c, code));
  const prefixOnly = candidates.some(
    (c) => stripMivaPrefix(c.courseCode) === stripMivaPrefix(code),
  );

  if (tier === 'exact') {
    if (exactPrimary) return MATCH_RULES.EXACT;
    if (combinedPart) return MATCH_RULES.COMBINED;
    if (prefixOnly) return MATCH_RULES.PREFIX;
    return MATCH_RULES.EXACT;
  }
  if (tier === 'normalized') return MATCH_RULES.PREFIX;
  // variant
  if (combinedPart) return MATCH_RULES.COMBINED;
  return MATCH_RULES.SPELLING;
}

/**
 * Resolve a single normalized entry.
 * @returns {{tier:string, rule:string, lessonUrl:string|null, linkRow:number|null,
 *            linkTitle:string|null, ambiguous:boolean, candidates:Array, conflict:object|null}}
 */
export function resolveEntry(entry, linkIndex) {
  const code = entry.courseCode ?? '';
  const parts = entry.courseCodes?.length ? entry.courseCodes : [code];

  // tier 1 — canonical full-code key (index also holds approved variants/parts)
  let hit = lookup(linkIndex, [code]);

  // tier 2 — MIVA- prefix stripped
  if (!hit) hit = lookup(linkIndex, [stripMivaPrefix(code)]);

  // tier 3 — slash parts in both directions, approved spellings
  if (!hit) {
    const keys = [];
    for (const part of parts) keys.push(part, stripMivaPrefix(part));
    hit = lookup(linkIndex, keys);
  }

  let tier = 'none';
  let records = hit?.records ?? [];
  if (records.length) {
    if (hit.key === code) tier = 'exact';
    else if (hit.key === stripMivaPrefix(code)) tier = 'normalized';
    else tier = 'variant';
  }

  // tier 4 — title fallback
  if (!records.length && entry.courseTitle) {
    const titleKey = collapseWhitespace(entry.courseTitle).toUpperCase();
    const bucket = linkIndex.byTitle.get(titleKey);
    if (bucket && bucket.length) {
      records = bucket;
      tier = 'title';
    }
  }

  const candidates = toCandidates(records);
  const distinctUrls = [...new Set(candidates.map((c) => c.url).filter(Boolean))];
  const ambiguous = distinctUrls.length > 1;

  const match = {
    tier,
    rule: describeRule(tier, code, candidates),
    lessonUrl: null,
    linkRow: null,
    linkTitle: null,
    ambiguous,
    titleMismatch: false,
    candidates,
    conflict: null,
  };

  if (!candidates.length) return match;

  if (ambiguous) {
    match.conflict = {
      courseCode: code,
      courseTitle: entry.courseTitle,
      reason: 'same-course-code-maps-to-multiple-urls',
      candidates: distinctUrls.map((url) => ({
        url,
        rows: candidates.filter((c) => c.url === url).map((c) => c.row),
        titles: [
          ...new Set(
            candidates.filter((c) => c.url === url).map((c) => c.courseTitle).filter(Boolean),
          ),
        ],
      })),
    };
    return match;
  }

  const chosen = candidates.find((c) => c.url) ?? candidates[0];
  match.lessonUrl = chosen.url ?? null;
  match.linkRow = chosen.row;
  match.linkTitle = chosen.courseTitle;
  // Code-based join whose titles disagree: keep the URL (code is the documented
  // join priority) but flag it so the data-quality metric stays visible.
  if (
    chosen.courseTitle &&
    entry.courseTitle &&
    chosen.courseTitle.trim().toUpperCase().replace(/\s+/g, ' ') !==
      entry.courseTitle.trim().toUpperCase().replace(/\s+/g, ' ')
  ) {
    match.titleMismatch = true;
  }
  return match;
}

/**
 * Attach `match` + `lessonUrl` to every entry and return a summary.
 * Entries are never mutated in place.
 */
export function resolveEntries(entries, linkIndex) {
  const summary = {
    total: entries.length,
    exact: 0,
    normalized: 0,
    variant: 0,
    title: 0,
    none: 0,
    matched: 0,
    urlResolved: 0,
    conflicted: 0,
    titleMismatches: 0,
    rules: {},
    conflictedEntries: [],
  };

  const resolved = entries.map((entry) => {
    const match = resolveEntry(entry, linkIndex);
    summary[match.tier] += 1;
    summary.rules[match.rule] = (summary.rules[match.rule] ?? 0) + 1;
    if (match.tier !== 'none') summary.matched += 1;
    if (match.lessonUrl) summary.urlResolved += 1;
    if (match.titleMismatch) summary.titleMismatches += 1;
    if (match.ambiguous) {
      summary.conflicted += 1;
      summary.conflictedEntries.push({
        sourceSheet: entry.sourceSheet,
        sourceCell: entry.sourceCell,
        courseCode: entry.courseCode,
        courseTitle: entry.courseTitle,
        conflict: match.conflict,
      });
    }
    return { ...entry, lessonUrl: match.lessonUrl, match };
  });

  return { entries: resolved, summary };
}
