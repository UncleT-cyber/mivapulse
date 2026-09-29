/**
 * Workbook sheet classification.
 *
 * Source of truth: TIMETABLE_STRUCTURE.md §1, §2, §10.
 *
 * Sheet names are NEVER the only source of truth (Excel truncates them to 31
 * characters and month sheets are not named consistently). Sheets are classified
 * structurally:
 *
 *   link sheet       header row is 'Courses Title' | 'Course Code' | 'Live Lesson Link'
 *   timetable sheet  has day labels of the form '<Weekday> DD/MM/YYYY' in column B
 *                    and at least one time-slot header
 *   excluded         everything else (empty sheet, legacy 2023-2025 cohort grids, …)
 */

import { looksLikeDayLabel, looksLikeSlotHeader } from './datetime.js';
import { rawCellValue } from './cells.js';

const LINK_HEADER = {
  a: 'courses title',
  b: 'course code',
  c: 'live lesson link',
};

const LEGACY_MARKER = 'course title';

const trim = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');

function cellString(sheet, row, col) {
  const value = rawCellValue(sheet, row, col);
  return typeof value === 'string' ? value : '';
}

/** Scan a sheet for the structural markers used by the classifier. */
function scan(sheet) {
  const info = {
    hasLinkHeader: false,
    dayLabelRows: 0,
    hasDayLabelWithDate: false,
    slotHeaderCells: 0,
    slotColumns: new Set(),
    hasLegacyMarker: false,
    hasContent: false,
    rowCount: sheet.rowCount ?? 0,
    columnCount: sheet.columnCount ?? 0,
  };

  const rows = Math.max(info.rowCount, 1);
  const cols = Math.max(info.columnCount, 1);

  if (rows >= 1 && cols >= 3) {
    const [a, b, c] = [cellString(sheet, 1, 1), cellString(sheet, 1, 2), cellString(sheet, 1, 3)];
    if (
      trim(a) === LINK_HEADER.a &&
      trim(b) === LINK_HEADER.b &&
      trim(c) === LINK_HEADER.c
    ) {
      info.hasLinkHeader = true;
    }
  }

  for (let r = 1; r <= rows; r += 1) {
    for (let c = 1; c <= cols; c += 1) {
      const value = rawCellValue(sheet, r, c);
      if (value === null || value === undefined) continue;
      if (typeof value === 'object') {
        const text = value.text ?? value.result ?? '';
        if (typeof text === 'string' && text.trim()) info.hasContent = true;
        continue;
      }
      if (typeof value !== 'string') {
        info.hasContent = true;
        continue;
      }
      if (!value.trim()) continue;
      info.hasContent = true;

      if (trim(value) === LEGACY_MARKER) info.hasLegacyMarker = true;

      if (c === 2 && looksLikeDayLabel(value)) {
        info.dayLabelRows += 1;
        if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(value)) info.hasDayLabelWithDate = true;
      }
      if (looksLikeSlotHeader(value)) {
        info.slotHeaderCells += 1;
        info.slotColumns.add(c);
      }
    }
  }

  return info;
}

/**
 * @param {{worksheets: Array}} workbook
 * @returns {{timetableSheets: Array<{name:string, sheet:object, info:object}>,
 *            linkSheet: {name:string, sheet:object, info:object}|null,
 *            excluded: Array<{name:string, reason:string}>}}
 */
export function classifyWorkbook(workbook) {
  const timetableSheets = [];
  const excluded = [];
  let linkSheet = null;

  for (const sheet of workbook.worksheets) {
    const info = scan(sheet);

    if (info.hasLinkHeader) {
      if (!linkSheet) linkSheet = { name: sheet.name, sheet, info };
      else excluded.push({ name: sheet.name, reason: 'duplicate-link-sheet' });
      continue;
    }

    if (info.hasLegacyMarker) {
      excluded.push({ name: sheet.name, reason: 'legacy-cohort-format' });
      continue;
    }

    if (!info.hasContent) {
      excluded.push({ name: sheet.name, reason: 'empty-sheet' });
      continue;
    }

    if (!info.hasDayLabelWithDate || info.slotHeaderCells === 0) {
      excluded.push({
        name: sheet.name,
        reason: !info.hasDayLabelWithDate ? 'no-day-labels-with-dates' : 'no-slot-headers',
      });
      continue;
    }

    timetableSheets.push({ name: sheet.name, sheet, info });
  }

  return { timetableSheets, linkSheet, excluded };
}
