/**
 * Timetable parser for the current 6-column MIVA format.
 *
 * Source of truth: reference/miva-master-timetable/TIMETABLE_STRUCTURE.md §2, §9.
 *
 * Design rules forced by the real file:
 *  - context (week / day / slot) is FORWARD-FILLED while walking rows top to bottom;
 *    merged ranges are never trusted (they demonstrably end before the content does)
 *  - a cell is a course only when it parses as `CODE - Title`; that single predicate
 *    rejects time headers, blank rows, the stray '-' marker and junk cells
 *  - slot headers are read from the sheet (they differ per sheet/week), never hard-coded
 *  - nothing here knows how the timetable looks visually
 */

import { parseCourseCell } from './courseCell.js';
import { readText } from './cells.js';
import {
  looksLikeDayLabel,
  looksLikeSlotHeader,
  looksLikeWeekLabel,
  parseDayLabel,
  parseSlotLabel,
} from './datetime.js';
import { classifyWorkbook } from './sheets.js';

const columnLetter = (index) => {
  let n = index;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

/**
 * Parse one current-format worksheet.
 *
 * @returns {{entries: Array, stats: object, warnings: Array}}
 */
export function parseTimetableSheet(sheet) {
  const rows = sheet.rowCount ?? 0;
  const cols = sheet.columnCount ?? 0;

  // Discover slot columns structurally: every column that carries a time header.
  const slotColumns = [];
  for (let c = 1; c <= cols; c += 1) {
    for (let r = 1; r <= rows; r += 1) {
      const text = readText(sheet, r, c);
      if (text !== null && looksLikeSlotHeader(text)) {
        slotColumns.push(c);
        break;
      }
    }
  }

  const entries = [];
  const warnings = [];
  const stats = {
    sourceSheet: sheet.name,
    slotColumns: slotColumns.map(columnLetter),
    scannedCells: 0,
    timeHeaderCells: 0,
    courseCells: 0,
    otherCells: 0,
    weeks: 0,
    dayBlocks: 0,
    entriesMissingDay: 0,
    entriesMissingSlot: 0,
    weekdayMismatches: 0,
  };

  let weekLabel = null;
  let weekIndex = 0;
  let dayLabel = null;
  let dayInfo = null;
  const slotContext = new Map(); // column index -> {slotLabel, startTime, endTime}

  const addWarning = (row, column, reason, detail = null) => {
    warnings.push({ sourceSheet: sheet.name, row, column: columnLetter(column), reason, detail });
  };

  for (let r = 1; r <= rows; r += 1) {
    const aText = readText(sheet, r, 1);
    if (aText !== null && looksLikeWeekLabel(aText)) {
      weekLabel = aText.replace(/\s+/g, ' ').trim();
      weekIndex += 1;
      stats.weeks += 1;
    }

    const bText = readText(sheet, r, 2);
    if (bText !== null && looksLikeDayLabel(bText)) {
      dayLabel = bText;
      dayInfo = parseDayLabel(bText);
      stats.dayBlocks += 1;
      for (const reason of dayInfo.warnings) addWarning(r, 2, reason, dayInfo.dayRaw);
      if (dayInfo.warnings.includes('weekday-date-mismatch')) stats.weekdayMismatches += 1;
    }

    for (const col of slotColumns) {
      const text = readText(sheet, r, col);
      if (text === null || text.trim() === '') continue;

      stats.scannedCells += 1;

      if (looksLikeSlotHeader(text)) {
        stats.timeHeaderCells += 1;
        const parsedSlot = parseSlotLabel(text);
        if (parsedSlot.ok) {
          slotContext.set(col, parsedSlot);
          for (const reason of parsedSlot.warnings) addWarning(r, col, reason, text);
        } else {
          addWarning(r, col, parsedSlot.reason, text);
        }
        continue;
      }

      const parsedCell = parseCourseCell(text);
      if (!parsedCell.ok) {
        stats.otherCells += 1;
        addWarning(r, col, parsedCell.reason, text);
        continue;
      }

      stats.courseCells += 1;

      const slot = slotContext.get(col) ?? null;
      const entry = {
        courseCode: parsedCell.courseCode,
        courseCodes: parsedCell.courseCodes,
        courseTitle: parsedCell.courseTitle,
        rawCellText: parsedCell.rawCellText,
        date: dayInfo?.date ?? null,
        day: dayInfo?.day ?? null,
        dayRaw: dayInfo?.dayRaw ?? dayLabel,
        weekLabel,
        weekIndex: weekIndex || null,
        startTime: slot?.startTime ?? null,
        endTime: slot?.endTime ?? null,
        slotLabel: slot?.slotLabel ?? null,
        sourceSheet: sheet.name,
        sourceRow: r,
        sourceColumn: columnLetter(col),
        sourceCell: `${columnLetter(col)}${r}`,
        warnings: [],
      };

      if (!dayInfo || !dayInfo.date) {
        stats.entriesMissingDay += 1;
        entry.warnings.push('missing-day-context');
        addWarning(r, col, 'entry-without-day-context', parsedCell.courseCode);
      }
      if (!slot) {
        stats.entriesMissingSlot += 1;
        entry.warnings.push('missing-slot-context');
        addWarning(r, col, 'entry-without-slot-context', parsedCell.courseCode);
      }
      if (parsedCell.recovered) {
        // 'CODE 123<whitespace>Title' recovered by rule 2 in courseCell.js
        entry.warnings.push('recovered-missing-separator');
        addWarning(r, col, 'recovered-missing-separator', parsedCell.courseCode);
      }

      entries.push(entry);
    }
  }

  return { entries, stats, warnings, slotColumns: slotColumns.map(columnLetter) };
}

/**
 * Parse a whole workbook: classify sheets, parse every current-format sheet,
 * exclude everything else (legacy cohort grids, the link sheet, empty sheets).
 *
 * @returns {{entries, sheets:{parsed,linkSheet,excluded}, stats, warnings}}
 */
export function parseWorkbook(workbook) {
  const { timetableSheets, linkSheet, excluded } = classifyWorkbook(workbook);

  const entries = [];
  const warnings = [];
  const sheetStats = [];
  const totals = {
    sheetsParsed: timetableSheets.length,
    scannedCells: 0,
    timeHeaderCells: 0,
    courseCells: 0,
    otherCells: 0,
    entriesMissingDay: 0,
    entriesMissingSlot: 0,
    weekdayMismatches: 0,
  };

  for (const { name, sheet } of timetableSheets) {
    const result = parseTimetableSheet(sheet);
    entries.push(...result.entries);
    warnings.push(...result.warnings);
    sheetStats.push(result.stats);
    totals.scannedCells += result.stats.scannedCells;
    totals.timeHeaderCells += result.stats.timeHeaderCells;
    totals.courseCells += result.stats.courseCells;
    totals.otherCells += result.stats.otherCells;
    totals.entriesMissingDay += result.stats.entriesMissingDay;
    totals.entriesMissingSlot += result.stats.entriesMissingSlot;
    totals.weekdayMismatches += result.stats.weekdayMismatches;
  }

  return {
    entries,
    sheets: {
      parsed: timetableSheets.map((s) => ({
        name: s.name,
        slotColumns: s.info.slotColumns.size,
        dayLabelRows: s.info.dayLabelRows,
      })),
      linkSheet: linkSheet ? { name: linkSheet.name } : null,
      excluded,
    },
    stats: { ...totals, perSheet: sheetStats },
    warnings,
  };
}
