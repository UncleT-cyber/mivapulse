/**
 * Workbook -> normalized dataset pipeline.
 *
 * This is the point where Excel knowledge stops: the input is an already-loaded
 * workbook object (any ExcelJS-compatible implementation), the output is the
 * normalized TimetableFlow dataset consumed by selection, rendering and export.
 *
 * Nothing here reads the filesystem or imports an Excel library directly, so the
 * exact same pipeline runs in the browser (src/app/excelAdapter.js), in the CLI
 * (src/index.js) and in tests.
 *
 * Source of truth for structure: TIMETABLE_STRUCTURE.md.
 */

import { buildLinkIndex } from './links/linkIndex.js';
import { resolveEntries } from './links/resolver.js';
import { validateEntries } from './model/entry.js';
import { classifyWorkbook } from './parser/sheets.js';
import { parseWorkbook } from './parser/timetableParser.js';

/**
 * Full pipeline over an already-loaded workbook.
 *
 * @param {{worksheets: Array}} workbook
 * @returns {{
 *   entries: Array,              // normalized + resolved (schedule joined with lesson URLs)
 *   rawEntries: Array,           // normalized schedule before URL resolution
 *   sheets: object,              // classification: parsed / link sheet / excluded
 *   stats: object,               // parser counters
 *   linkStats: object,           // link-index counters
 *   matchSummary: object,        // join-tier counters + conflicts
 *   validation: object,          // structural validation of the normalized output
 *   warnings: Array
 * }}
 */
export function processWorkbook(workbook) {
  const parsed = parseWorkbook(workbook);
  const { linkSheet } = classifyWorkbook(workbook);

  if (!linkSheet) {
    throw new Error('Link source not found: no sheet with headers "Courses Title" | "Course Code" | "Live Lesson Link"');
  }

  const linkIndex = buildLinkIndex(linkSheet.sheet);
  const { entries, summary } = resolveEntries(parsed.entries, linkIndex);

  return {
    entries,
    rawEntries: parsed.entries,
    sheets: parsed.sheets,
    stats: parsed.stats,
    linkStats: linkIndex.stats,
    linkConflicts: linkIndex.conflicts,
    matchSummary: summary,
    validation: validateEntries(entries),
    warnings: parsed.warnings,
  };
}
