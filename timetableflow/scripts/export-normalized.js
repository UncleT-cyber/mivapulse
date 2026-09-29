/**
 * Phase 5 — export the normalized TimetableFlow dataset.
 *
 *   node scripts/export-normalized.js [workbookPath] [outPath]
 *   npm run export
 *
 * Read-only with respect to the workbook. Writes:
 *   - output/timetableflow.normalized.json   full normalized dataset + run metadata
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { loadWorkbook, processWorkbook } from '../src/index.js';
import { toDatasetEntry } from '../src/model/entry.js';
import { REFERENCE_WORKBOOK } from './validate-real-workbook.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = path.join(ROOT, 'output', 'timetableflow.normalized.json');

const [workbookPath = REFERENCE_WORKBOOK, outPath = DEFAULT_OUT] = process.argv.slice(2);

const bytes = await readFile(workbookPath);
const sha256 = createHash('sha256').update(bytes).digest('hex');

const workbook = await loadWorkbook(bytes);
const result = processWorkbook(workbook);

const payload = {
  meta: {
    generator: 'timetableflow/0.1.0',
    generatedAt: new Date().toISOString(),
    source: {
      file: path.relative(ROOT, workbookPath),
      sha256,
      bytes: bytes.length,
    },
    classification: {
      timetableSheets: result.sheets.parsed.map((s) => s.name),
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
      perSheet: result.stats.perSheet,
    },
    linkStats: result.linkStats,
    linkConflicts: result.linkConflicts,
    matchSummary: result.matchSummary,
    validation: result.validation,
    warnings: result.warnings,
  },
  entries: result.entries.map((entry) => toDatasetEntry(entry)),
};

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

const byTier = ['exact', 'normalized', 'variant', 'title', 'none']
  .map((tier) => `${tier}=${result.matchSummary[tier]}`)
  .join(' ');

console.log(
  JSON.stringify(
    {
      out: path.relative(ROOT, outPath),
      sha256,
      entries: payload.entries.length,
      tiers: byTier,
      urlResolved: result.matchSummary.urlResolved,
      conflicted: result.matchSummary.conflicted,
      unmatched: result.matchSummary.none,
      validationInvalid: result.validation.invalid.length,
      warnings: result.warnings.length,
      september2026: payload.entries.filter((e) => /September 2026/.test(e.sourceSheet)).length,
    },
    null,
    2,
  ),
);
