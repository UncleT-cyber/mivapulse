import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { validate, REFERENCE_WORKBOOK } from '../scripts/validate-real-workbook.js';

/**
 * Phase 4/5 regression — runs the whole pipeline over the immutable reference
 * workbook (read-only copy under reference/) and asserts the validated baseline.
 *
 * Intentional, approved delta vs the reconnaissance numbers: +1 entry.
 * The recon baseline of 4556 strict 'CODE - Title' cells still holds exactly;
 * one additional cell (November 2025!E40, 'MIVA-PAD 211<tab>Foundations of
 * Political Economy') had lost its separator and is now recovered by the
 * documented narrow rule -> 4557 entries.
 *   link sheet = 577 rows, 577 URLs (313 hyperlink + 264 HYPERLINK formula),
 *   549 distinct codes, 27 duplicate codes, 1 conflicting code (NSC 309)
 */

const EXPECTED_SHA256 = 'fab562fc1c186fab757017b293a050a5153da669ba678a615590d3fa454b8eca';

let report;

test.before(async () => {
  ({ report } = await validate());
});

test('reference workbook is byte-identical to the recon snapshot', async () => {
  const bytes = await readFile(REFERENCE_WORKBOOK);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha256, EXPECTED_SHA256);
  assert.equal(report.source.sha256, EXPECTED_SHA256);
});

test('sheet classification: 12 timetable sheets, 1 link sheet, 8 excluded', () => {
  assert.equal(report.classification.parsed.length, 12);
  assert.equal(report.classification.linkSheet, 'Live Lesson Links');
  assert.equal(report.classification.excluded.length, 8);
  const reasons = report.classification.excluded.map((e) => e.reason);
  assert.equal(reasons.filter((r) => r === 'legacy-cohort-format').length, 7);
  assert.equal(reasons.filter((r) => r === 'empty-sheet').length, 1);
  assert.ok(report.classification.parsed.includes('September 2026 Live Lesson Time'));
});

test('parser reproduces the cell census baseline', () => {
  assert.equal(report.parserStats.sheetsParsed, 12);
  assert.equal(report.parserStats.scannedCells, 4630);
  assert.equal(report.parserStats.timeHeaderCells, 72);
  assert.equal(report.parserStats.courseCells, 4557);
  assert.equal(report.parserStats.otherCells, 1);
  assert.equal(report.parserStats.entries, 4557);
  assert.equal(report.parserStats.entriesMissingDay, 0);
  assert.equal(report.parserStats.entriesMissingSlot, 0);
  assert.equal(report.parserStats.weekdayMismatches, 0);
});

test('every slot column is discovered structurally on every sheet', () => {
  for (const sheet of report.parserStats.slotColumnsBySheet) {
    assert.deepEqual(sheet.slotColumns, ['C', 'D', 'E'], sheet.sheet);
    assert.ok(sheet.weeks >= 1, sheet.sheet);
    assert.ok(sheet.dayBlocks >= 1, sheet.sheet);
  }
});

test('join reproduces the baseline tier counts', () => {
  const { match } = report;
  assert.equal(match.total, 4557);
  assert.equal(match.matched, 4557);
  assert.equal(match.exact, 4530); // 4529 recon + the recovered MIVA-PAD 211
  assert.equal(match.normalized + match.variant, 23);
  assert.equal(match.title, 4);
  assert.equal(match.none, 0);
  assert.equal(report.unmatched.length, 0);
});

test('link index reproduces the baseline link statistics', () => {
  const stats = report.linkStats;
  assert.equal(stats.scannedRows, 577);
  assert.equal(stats.rowsWithUrl, 577);
  assert.equal(stats.rowsWithoutUrl, 0);
  assert.equal(stats.urlByHyperlink, 313);
  assert.equal(stats.urlByFormula, 264);
  assert.equal(stats.urlByText, 0);
  assert.equal(stats.distinctCodes, 549);
  assert.equal(stats.duplicateCodes, 27);
  assert.equal(stats.conflictCodes, 1);
});

test('NSC 309 is the only conflicting code and is never silently resolved', () => {
  assert.equal(report.linkConflicts.length, 1);
  assert.equal(report.linkConflicts[0].courseCode, 'NSC 309');
  assert.deepEqual(
    report.linkConflicts[0].candidates.map((c) => c.row),
    [4, 5],
  );
  assert.equal(new Set(report.linkConflicts[0].candidates.map((c) => c.url)).size, 2);

  assert.equal(report.match.conflicted, 5); // 5 timetable cells use NSC 309
  assert.equal(report.match.urlResolved, 4557 - 5);
  for (const entry of report.match.conflictedEntries) {
    assert.equal(entry.courseCode, 'NSC 309');
    assert.equal(entry.conflict.reason, 'same-course-code-maps-to-multiple-urls');
  }
});

test('September 2026 has 464 entries and zero missing live-lesson URLs', () => {
  assert.equal(report.september2026.entries, 464);
  assert.equal(report.september2026.urlResolved, 464);
  assert.deepEqual(report.september2026.missingUrls, []);
  assert.equal(report.september2026.days.length, 8);
  assert.deepEqual(report.september2026.days, [
    '2026-09-14',
    '2026-09-15',
    '2026-09-16',
    '2026-09-17',
    '2026-09-21',
    '2026-09-22',
    '2026-09-23',
    '2026-09-24',
  ]);
});

test('every normalized entry passes structural validation', () => {
  assert.equal(report.validation.valid, 4557);
  assert.deepEqual(report.validation.invalid, []);
});

test('only the two known anomalies are reported as warnings', () => {
  assert.deepEqual(report.warnings.byReason, {
    'not-a-course-cell': 1, // junk cell E154 on November 2026 -> rejected
    'recovered-missing-separator': 1, // E40 on November 2025 -> recovered
  });
  const reasons = report.warnings.entries.map((w) => `${w.sourceSheet}!${w.column}${w.row}:${w.reason}`);
  assert.ok(reasons.includes('November 2026 Live Lesson Timet!E154:not-a-course-cell'));
  assert.ok(reasons.includes('November 2025 Live Lesson Timet!E40:recovered-missing-separator'));
});

test('MIVA-PAD 211 is recovered deterministically, not discarded', () => {
  assert.equal(report.recovered.length, 1);
  const entry = report.recovered[0];
  assert.equal(entry.cell, 'November 2025 Live Lesson Timet!E40');
  assert.equal(entry.code, 'MIVA-PAD 211');
  assert.equal(entry.title, 'Foundations of Political Economy');
  assert.equal(entry.date, '2025-11-26');
  assert.equal(entry.matchTier, 'exact'); // code-based join, link row 201
  assert.equal(entry.lessonUrl, 'http://meet.google.com/jqk-vcfp-mru');
  // the link row carries a different title: surfaced, URL still joined by code
  assert.equal(entry.linkTitle, 'Nigerian Economy and Public Policy');
  assert.equal(entry.titleMismatch, true);
});

test('code-joined title disagreements stay a visible data-quality metric', () => {
  // mostly wording differences ('Elements of Public Admin' etc.); the URL stays
  // joined by code, but the lesson is reported as needs-verification
  assert.equal(report.match.titleMismatches, 152);
});

test('baseline check object is all-true', () => {
  for (const [key, value] of Object.entries(report.baselineCheck.match)) {
    assert.equal(value, true, `baseline mismatch: ${key}`);
  }
});

test('link confidence: verified means identity match AND no contradiction', () => {
  const confidence = report.confidence;
  assert.equal(confidence.total, 4557, 'every lesson still reports a link state');
  assert.equal(confidence.verified + confidence['needs-verification'] + confidence.missing, confidence.total);
  assert.equal(confidence.missing, 0, 'no lesson lost its link in the confidence change');
  assert.equal(confidence.verified, 4396);
  assert.equal(confidence['needs-verification'], 161);
  assert.deepEqual(confidence.reasons, {
    'title-mismatch': 152, // code-joined rows whose title disagrees with the timetable
    'title-only-match': 4, // CSC 101 / CSC 103 joined by course title alone
    'conflicting-candidates': 5, // NSC 309: two URLs behind one code
  });

  // every measured title disagreement is held back, including the two severe ones
  assert.equal(confidence.reasons['title-mismatch'], report.match.titleMismatches);
  assert.equal(confidence.titleMismatchCourses.length, 26);
  assert.ok(confidence.titleMismatchCourses.includes('CMS 302'));
  assert.ok(confidence.titleMismatchCourses.includes('MIVA-PAD 211'));
});
