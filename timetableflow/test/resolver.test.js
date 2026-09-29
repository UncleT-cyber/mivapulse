import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  loadWorkbook,
  parseWorkbook,
  buildLinkIndex,
  resolveEntries,
} from '../src/index.js';
import { classifyWorkbook } from '../src/parser/sheets.js';
import { validateEntries } from '../src/model/entry.js';
import { buildFixtureBuffer, FIXTURE_URLS } from './helpers/fixtureWorkbook.js';

let resolved;
let summary;
let linkIndex;

test.before(async () => {
  const workbook = await loadWorkbook(await buildFixtureBuffer());
  const { linkSheet } = classifyWorkbook(workbook);
  linkIndex = buildLinkIndex(linkSheet.sheet);
  const parsed = parseWorkbook(workbook);
  const out = resolveEntries(parsed.entries, linkIndex);
  resolved = out.entries;
  summary = out.summary;
});

test('reads BOTH link mechanisms (hyperlink object and HYPERLINK formula)', () => {
  assert.equal(linkIndex.stats.scannedRows, 16);
  assert.equal(linkIndex.stats.rowsWithUrl, 16);
  assert.equal(linkIndex.stats.rowsWithoutUrl, 0);
  assert.equal(linkIndex.stats.urlByHyperlink, 13);
  assert.equal(linkIndex.stats.urlByFormula, 3);
  assert.equal(linkIndex.stats.urlByText, 0);
  // styled-but-empty rows are not indexed
  assert.equal(linkIndex.records.length, 16);
});

test('tier 1 — exact course code', () => {
  const entry = resolved.find((e) => e.sourceCell === 'C3');
  assert.equal(entry.match.tier, 'exact');
  assert.equal(entry.match.rule, 'exact-course-code');
  assert.equal(entry.lessonUrl, FIXTURE_URLS.ift211);
});

test('HYPERLINK formula resolves to its URL', () => {
  const entry = resolved.find((e) => e.sourceCell === 'D3');
  assert.equal(entry.match.tier, 'exact');
  assert.equal(entry.lessonUrl, FIXTURE_URLS.sen306);
  assert.equal(entry.match.candidates[0].urlSource, 'formula');
});

test('approved spelling variant MIVA_PAD joins to MIVA-PAD 208', () => {
  const entry = resolved.find((e) => e.sourceCell === 'D4');
  assert.equal(entry.match.tier, 'exact');
  assert.equal(entry.lessonUrl, FIXTURE_URLS.pad208);
});

test('tier 2 — MIVA- prefix stripped form', () => {
  const entry = resolved.find((e) => e.sourceCell === 'C15');
  assert.equal(entry.courseCode, 'MIVA-ECO 313');
  assert.equal(entry.match.tier, 'normalized');
  assert.equal(entry.match.rule, 'miva-prefix-stripped-course-code');
  assert.equal(entry.lessonUrl, FIXTURE_URLS.eco313);
});

test('timetable code without prefix joins to a MIVA- prefixed link row', () => {
  const entry = resolved.find((e) => e.sourceCell === 'D7');
  assert.equal(entry.courseCode, 'NSC 512');
  assert.equal(entry.match.tier, 'exact');
  assert.equal(entry.match.rule, 'miva-prefix-stripped-course-code');
  assert.equal(entry.lessonUrl, FIXTURE_URLS.nsc512);
});

test('tier 3 — slash-combined codes matched part by part', () => {
  const entry = resolved.find((e) => e.sourceCell === 'C8');
  assert.equal(entry.courseCode, 'STA 111/ MIVA-ECO 105');
  assert.equal(entry.match.tier, 'variant');
  assert.equal(entry.match.rule, 'combined-course-code-part');
  assert.equal(entry.lessonUrl, FIXTURE_URLS.sta111);
});

test('combined link code matches when the timetable shows one half', () => {
  const entry = resolved.find((e) => e.sourceCell === 'D15');
  assert.equal(entry.courseCode, 'INS 204');
  assert.equal(entry.match.tier, 'exact');
  assert.equal(entry.match.rule, 'combined-course-code-part');
  assert.equal(entry.lessonUrl, FIXTURE_URLS.ins204);
});

test('identical combined codes join directly', () => {
  const entry = resolved.find((e) => e.sourceCell === 'C7');
  assert.equal(entry.courseCode, 'BUA 203/ENT 125');
  assert.equal(entry.match.tier, 'exact');
  assert.equal(entry.match.rule, 'exact-course-code');
  assert.equal(entry.lessonUrl, FIXTURE_URLS.bua203);
});

test('tier 4 — course-title fallback for a miscoded cell', () => {
  const entry = resolved.find((e) => e.sourceCell === 'D8');
  assert.equal(entry.courseCode, 'CSC 101');
  assert.equal(entry.match.tier, 'title');
  assert.equal(entry.match.rule, 'course-title-fallback');
  assert.equal(entry.lessonUrl, FIXTURE_URLS.css101);
  assert.equal(entry.match.linkRow, 16);
});

test('no-match stays explicit instead of guessing', () => {
  const pad = resolved.find((e) => e.courseCode === 'PAD 302');
  assert.equal(pad.match.tier, 'none');
  assert.equal(pad.match.rule, 'no-match');
  assert.equal(pad.lessonUrl, null);

  const eco = resolved.find((e) => e.courseCode === 'ECO 306');
  assert.equal(eco.match.tier, 'none');
  assert.equal(eco.lessonUrl, null);
});

test('duplicate course code with two URLs is surfaced, never silently picked', () => {
  const conflicted = resolved.filter((e) => e.courseCode === 'NSC 309');
  assert.equal(conflicted.length, 1);

  const entry = conflicted[0];
  assert.equal(entry.lessonUrl, null);
  assert.equal(entry.match.ambiguous, true);
  assert.equal(entry.match.tier, 'exact');
  assert.equal(entry.match.conflict.reason, 'same-course-code-maps-to-multiple-urls');

  const urls = entry.match.conflict.candidates.map((c) => c.url).sort();
  assert.deepEqual(urls, [FIXTURE_URLS.nsc309a, FIXTURE_URLS.nsc309b].sort());
  assert.deepEqual(
    entry.match.conflict.candidates.map((c) => c.rows.flat()).sort(),
    [[11], [12]],
  );
  assert.equal(summary.conflicted, 1);
  assert.equal(summary.conflictedEntries[0].sourceCell, 'E7');
});

test('summary counts every tier and rule', () => {
  assert.equal(summary.total, 18);
  assert.equal(summary.exact, 13);
  assert.equal(summary.normalized, 1);
  assert.equal(summary.variant, 1);
  assert.equal(summary.title, 1);
  assert.equal(summary.none, 2);
  assert.equal(summary.matched, 16);
  assert.equal(summary.urlResolved, 15); // NSC 309 intentionally unresolved
  assert.equal(summary.conflicted, 1);

  assert.equal(summary.rules['exact-course-code'], 11);
  assert.equal(summary.rules['miva-prefix-stripped-course-code'], 2);
  assert.equal(summary.rules['combined-course-code-part'], 2);
  assert.equal(summary.rules['course-title-fallback'], 1);
  assert.equal(summary.rules['no-match'], 2);
});

test('resolved entries still pass validation (conflict without URL is valid)', () => {
  const { valid, invalid } = validateEntries(resolved);
  assert.deepEqual(invalid, []);
  assert.equal(valid, 18);
});

test('a conflict that also carries a URL would be rejected', async () => {
  const { validateEntry } = await import('../src/model/entry.js');
  const bad = resolved.find((e) => e.courseCode === 'NSC 309');
  const errors = validateEntry({ ...bad, lessonUrl: FIXTURE_URLS.nsc309a });
  assert.ok(errors.includes('conflict-must-not-pick-a-url'));
});
