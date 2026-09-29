/**
 * TimetableFlow core — framework-independent timetable processing.
 *
 * Pipeline (architectural rule: templates never know Excel, parser never knows
 * how the timetable looks):
 *
 *   MIVA workbook -> Parser -> Normalized entries -> Course matcher -> Student timetable
 *                                                                            |
 *                                                                  Template renderer /
 *                                                                  Calendar exporter
 *
 * This module is intentionally free of any browser/UI/routing concern so the whole
 * workspace can later be dropped into MivaPulse.
 */

import ExcelJS from 'exceljs';

import { processWorkbook } from './pipeline.js';
import { buildLinkIndex } from './links/linkIndex.js';
import { resolveEntries } from './links/resolver.js';
import { validateEntries, toPublicEntry, toDatasetEntry } from './model/entry.js';
import { classifyWorkbook } from './parser/sheets.js';
import { parseWorkbook, parseTimetableSheet } from './parser/timetableParser.js';
import { parseCourseCell, normalizeCourseCode, splitCourseCodes } from './parser/courseCell.js';
import {
  parseDayLabel,
  parseSlotLabel,
  normalizeDayName,
  looksLikeDayLabel,
  looksLikeSlotHeader,
  looksLikeWeekLabel,
} from './parser/datetime.js';

export {
  // pipeline
  processWorkbook,
  // parser
  classifyWorkbook,
  parseWorkbook,
  parseTimetableSheet,
  parseCourseCell,
  normalizeCourseCode,
  splitCourseCodes,
  parseDayLabel,
  parseSlotLabel,
  normalizeDayName,
  looksLikeDayLabel,
  looksLikeSlotHeader,
  looksLikeWeekLabel,
  // resolver
  buildLinkIndex,
  resolveEntries,
  // model
  validateEntries,
  toPublicEntry,
  toDatasetEntry,
};

/** Read an .xlsx workbook (read-only; the source file is never modified). */
export async function loadWorkbook(pathOrBuffer) {
  const workbook = new ExcelJS.Workbook();
  if (typeof pathOrBuffer === 'string') {
    await workbook.xlsx.readFile(pathOrBuffer);
  } else {
    await workbook.xlsx.load(pathOrBuffer);
  }
  return workbook;
}

/** Convenience: load + process in one call. */
export async function processFile(path) {
  const workbook = await loadWorkbook(path);
  return processWorkbook(workbook);
}

// Phase 6 — student selection, timetable, template renderer, calendar export.
// These modules never import ExcelJS: they consume normalized entries only.
export * from './student/index.js';
export * from './render/index.js';
export * from './export/index.js';
