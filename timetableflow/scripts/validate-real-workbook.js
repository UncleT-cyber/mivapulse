/**
 * Phase 4 — validate the parser + resolver against the REAL MIVA master timetable.
 *
 * Read-only: the reference workbook is never modified.
 *
 *   node scripts/validate-real-workbook.js [--json]
 *
 * Reproduces the reconnaissance baseline:
 *   4630 scanned cells · 4556 entries · 4556 joined
 *   (4529 exact / 23 normalized-or-variant / 4 title fallback)
 *   September 2026 = 464 entries
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { loadWorkbook, processWorkbook } from '../src/index.js';
import { linkState, linkStateReason } from '../src/student/timetable.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REFERENCE_WORKBOOK = path.join(
  ROOT,
  'reference',
  'miva-master-timetable',
  'Live Lesson Time Table - Students Copy.xlsx',
);

/**
 * Reconnaissance baseline (TIMETABLE_STRUCTURE.md) vs the implemented parser.
 *
 * Intentional, approved difference: +1 entry.
 *   recon 4556 entries  ->  4557 entries
 *   November 2025!E40 = 'MIVA-PAD 211\tFoundations of Political Economy' is a real
 *   course that lost its '-' separator. It used to be dropped (4556/4556 strict);
 *   the approved recovery rule now extracts it deterministically (courseCell.js
 *   rule 2) and flags it with warning 'recovered-missing-separator'.
 *   Everything else — 4630 scanned cells, 72 time headers, 4556 strict cells,
 *   23 variant joins, 4 title joins, 549 link codes, September 2026 = 464 — is
 *   reproduced unchanged.
 */
const BASELINE = {
  scannedCells: 4630,
  strictCourseCells: 4556,
  entries: 4557, // 4556 strict + 1 recovered
  joined: 4530 + 23 + 4,
  exact: 4530,
  normalizedOrVariant: 23,
  title: 4,
  september2026Entries: 464,
};

function groupBy(items, keyFn) {
  const out = {};
  for (const item of items) {
    const key = keyFn(item);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

export async function validate(pathToWorkbook = REFERENCE_WORKBOOK) {
  const bytes = await readFile(pathToWorkbook);
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  const workbook = await loadWorkbook(bytes);
  const result = processWorkbook(workbook);

  const september = result.entries.filter((e) => /September 2026/.test(e.sourceSheet));
  const summary = result.matchSummary;
  const recovered = result.entries.filter((e) => e.warnings.includes('recovered-missing-separator'));

  const states = { verified: 0, 'needs-verification': 0, missing: 0 };
  const reasons = { 'conflicting-candidates': 0, 'title-only-match': 0, 'title-mismatch': 0 };
  const mismatchCourses = new Set();
  for (const entry of result.entries) {
    states[linkState(entry)] += 1;
    const reason = linkStateReason(entry);
    if (reason) reasons[reason] += 1;
    if (entry.match?.titleMismatch) mismatchCourses.add(entry.courseCode);
  }

  const report = {
    source: {
      path: pathToWorkbook,
      sha256,
      bytes: bytes.length,
      sheets: workbook.worksheets.map((ws) => ({ name: ws.name, state: ws.state })),
    },
    classification: {
      parsed: result.sheets.parsed.map((s) => s.name),
      linkSheet: result.sheets.linkSheet?.name ?? null,
      excluded: result.sheets.excluded,
    },
    parserStats: {
      sheetsParsed: result.stats.sheetsParsed,
      scannedCells: result.stats.scannedCells,
      timeHeaderCells: result.stats.timeHeaderCells,
      courseCells: result.stats.courseCells,
      otherCells: result.stats.otherCells,
      entriesMissingDay: result.stats.entriesMissingDay,
      entriesMissingSlot: result.stats.entriesMissingSlot,
      weekdayMismatches: result.stats.weekdayMismatches,
      entries: result.rawEntries.length,
      slotColumnsBySheet: result.stats.perSheet.map((s) => ({
        sheet: s.sourceSheet,
        slotColumns: s.slotColumns,
        weeks: s.weeks,
        dayBlocks: s.dayBlocks,
        entries: s.courseCells,
        scannedCells: s.scannedCells,
      })),
    },
    linkStats: result.linkStats,
    linkConflicts: result.linkConflicts,
    match: {
      total: summary.total,
      matched: summary.matched,
      exact: summary.exact,
      normalized: summary.normalized,
      variant: summary.variant,
      title: summary.title,
      none: summary.none,
      rules: summary.rules,
      urlResolved: summary.urlResolved,
      conflicted: summary.conflicted,
      titleMismatches: summary.titleMismatches,
      conflictedEntries: summary.conflictedEntries,
    },
    confidence: {
      total: result.entries.length,
      ...states,
      reasons,
      titleMismatchCourses: [...mismatchCourses].sort(),
    },
    september2026: {
      entries: september.length,
      urlResolved: september.filter((e) => e.lessonUrl).length,
      missingUrls: september.filter((e) => !e.lessonUrl).map((e) => ({
        cell: `${e.sourceSheet}!${e.sourceCell}`,
        code: e.courseCode,
        title: e.courseTitle,
        reason: e.match?.ambiguous ? 'conflicting-urls' : 'no-match-or-unresolved',
      })),
      days: [...new Set(september.map((e) => e.date))].sort(),
      courses: new Set(september.map((e) => e.courseCode)).size,
    },
    recovered: recovered.map((e) => ({
      cell: `${e.sourceSheet}!${e.sourceCell}`,
      code: e.courseCode,
      title: e.courseTitle,
      date: e.date,
      lessonUrl: e.lessonUrl,
      matchTier: e.match.tier,
      linkTitle: e.match.linkTitle,
      titleMismatch: e.match.titleMismatch,
    })),
    validation: result.validation,
    warnings: {
      total: result.warnings.length,
      byReason: groupBy(result.warnings, (w) => w.reason),
      entries: result.warnings,
    },
    unmatched: result.entries
      .filter((e) => e.match.tier === 'none')
      .map((e) => ({
        cell: `${e.sourceSheet}!${e.sourceCell}`,
        code: e.courseCode,
        title: e.courseTitle,
        date: e.date,
      })),
    baselineCheck: {
      expected: BASELINE,
      actual: {
        scannedCells: result.stats.scannedCells,
        strictCourseCells: result.stats.courseCells - recovered.length,
        entries: result.rawEntries.length,
        joined: summary.matched,
        exact: summary.exact,
        normalizedOrVariant: summary.normalized + summary.variant,
        title: summary.title,
        recovered: recovered.length,
        september2026Entries: september.length,
      },
      match: {
        scannedCells: result.stats.scannedCells === BASELINE.scannedCells,
        strictCourseCells: result.stats.courseCells - recovered.length === BASELINE.strictCourseCells,
        entries: result.rawEntries.length === BASELINE.entries,
        joined: summary.matched === BASELINE.joined,
        exact: summary.exact === BASELINE.exact,
        normalizedOrVariant: summary.normalized + summary.variant === BASELINE.normalizedOrVariant,
        title: summary.title === BASELINE.title,
        september2026Entries: september.length === BASELINE.september2026Entries,
      },
    },
  };

  return { report, result };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const { report } = await validate();
  const asJson = process.argv.includes('--json');
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(JSON.stringify({ ...report, warnings: { ...report.warnings, entries: undefined }, unmatched: report.unmatched }, null, 2));
  }
}
