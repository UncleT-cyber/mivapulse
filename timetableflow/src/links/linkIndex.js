/**
 * Live-lesson link index — the `Live Lesson Links` sheet.
 *
 * Source of truth: TIMETABLE_STRUCTURE.md §5.
 *
 *   column A 'Courses Title' | column B 'Course Code' | column C 'Live Lesson Link'
 *
 * Column C NEVER stores the URL as ordinary cell text. It uses two mechanisms that
 * overlap inside the same column (rows ~275-535 contain a mix of both):
 *
 *   1. embedded hyperlink object  -> cell.hyperlink (exceljs) / .rels Target (raw XML)
 *   2. HYPERLINK() formula        -> '=HYPERLINK("https://…","Link")'
 *      (including Excel's shared-formula form, where the cell only stores
 *       {sharedFormula:'C316'} and exceljs exposes the resolved text on cell.formula)
 *
 * The displayed text is always the literal string 'Link'.
 */

import { collapseWhitespace, normalizeCourseCode, splitCourseCodes, stripMivaPrefix } from '../parser/courseCell.js';
import { isCovered } from '../parser/cells.js';

const HYPERLINK_FORMULA = /^=?HYPERLINK\(\s*"([^"]+)"/i;

function readCell(sheet, row, column) {
  if (isCovered(sheet, row, column)) return { url: null, source: null };
  const cell = sheet.getCell(row, column);
  const value = cell.value;

  // 1. embedded hyperlink object
  if (typeof cell.hyperlink === 'string' && cell.hyperlink.trim()) {
    return { url: cell.hyperlink.trim(), source: 'hyperlink' };
  }
  if (value && typeof value === 'object' && typeof value.hyperlink === 'string' && value.hyperlink.trim()) {
    return { url: value.hyperlink.trim(), source: 'hyperlink' };
  }

  // 2. HYPERLINK() formula. exceljs resolves shared formulas through cell.formula
  //    (rows 317 and 410 of the reference file store only <f t="shared" si="…"/>);
  //    value.formula covers ordinary formulas, value.sharedFormula the master cell.
  const formulaText =
    (typeof cell.formula === 'string' && cell.formula) ||
    (value && typeof value === 'object' && typeof value.formula === 'string' && value.formula) ||
    null;
  if (formulaText) {
    const match = HYPERLINK_FORMULA.exec(formulaText);
    if (match) return { url: match[1], source: 'formula' };
  }
  if (value && typeof value === 'object' && typeof value.sharedFormula === 'string') {
    const master = sheet.getCell(value.sharedFormula);
    const masterFormula =
      (typeof master.formula === 'string' && master.formula) ||
      (master.value && typeof master.value.formula === 'string' && master.value.formula) ||
      null;
    if (masterFormula) {
      const match = HYPERLINK_FORMULA.exec(masterFormula);
      if (match) return { url: match[1], source: 'formula' };
    }
  }

  if (typeof value === 'string') {
    const match = HYPERLINK_FORMULA.exec(value.trim());
    if (match) return { url: match[1], source: 'formula' };
    // 3. plain URL text — not observed in the reference file, handled for safety
    if (/^https?:\/\/\S+$/i.test(value.trim())) return { url: value.trim(), source: 'text' };
  }

  if (value && typeof value === 'object' && typeof value.text === 'string') {
    const text = value.text.trim();
    if (/^https?:\/\/\S+$/i.test(text)) return { url: text, source: 'text' };
  }

  return { url: null, source: null };
}

/** Index keys a single link row is filed under (mirrors the validated baseline). */
export function indexKeysForCode(code) {
  const primary = normalizeCourseCode(code);
  const keys = new Set();
  const add = (k) => {
    if (k) keys.add(k);
  };

  add(primary);
  add(stripMivaPrefix(primary));
  for (const part of splitCourseCodes(primary)) {
    add(part);
    add(stripMivaPrefix(part));
  }
  return [...keys];
}

/**
 * Build the link index from the `Live Lesson Links` worksheet.
 *
 * @returns {{
 *   records: Array<{row:number, courseTitle:string|null, courseCode:string, courseCodes:string[],
 *                   url:string|null, urlSource:string|null}>,
 *   byCode: Map<string, Array>,
 *   byTitle: Map<string, Array>,
 *   conflicts: Array<{courseCode:string, candidates:Array, reason:string}>,
 *   stats: object
 * }}
 */
export function buildLinkIndex(linkSheet) {
  const records = [];
  const byCode = new Map();
  const byTitle = new Map();

  const rows = linkSheet.rowCount ?? 0;
  const stats = {
    sourceSheet: linkSheet.name,
    scannedRows: 0,
    rowsWithUrl: 0,
    rowsWithoutUrl: 0,
    urlByHyperlink: 0,
    urlByFormula: 0,
    urlByText: 0,
    distinctCodes: 0,
    distinctUrls: 0,
    duplicateCodes: 0,
    conflictCodes: 0,
  };

  for (let row = 2; row <= rows; row += 1) {
    const titleValue = linkSheet.getCell(row, 1).value;
    const codeValue = linkSheet.getCell(row, 2).value;
    const title = typeof titleValue === 'string' ? titleValue.trim() : null;
    const rawCode = typeof codeValue === 'string' ? codeValue.trim() : null;

    if (!title && !rawCode) continue; // styled-but-empty rows (579-1039 in the real file)

    stats.scannedRows += 1;
    const { url, source } = readCell(linkSheet, row, 3);

    const courseCode = rawCode ? normalizeCourseCode(rawCode) : '';
    const record = {
      row,
      courseTitle: title,
      courseCode,
      courseCodes: courseCode ? splitCourseCodes(courseCode) : [],
      url,
      urlSource: source,
    };
    records.push(record);

    if (url) {
      stats.rowsWithUrl += 1;
      if (source === 'hyperlink') stats.urlByHyperlink += 1;
      else if (source === 'formula') stats.urlByFormula += 1;
      else if (source === 'text') stats.urlByText += 1;
    } else {
      stats.rowsWithoutUrl += 1;
    }

    if (courseCode) {
      for (const key of indexKeysForCode(courseCode)) {
        const bucket = byCode.get(key);
        if (bucket) bucket.push(record);
        else byCode.set(key, [record]);
      }
    }
    if (title) {
      const key = collapseWhitespace(title).toUpperCase();
      const bucket = byTitle.get(key);
      if (bucket) bucket.push(record);
      else byTitle.set(key, [record]);
    }
  }

  // Conflicts are evaluated on the primary (full) course code only: same code,
  // more than one DISTINCT url. The reference file has exactly one: NSC 309.
  const byPrimary = new Map();
  for (const record of records) {
    if (!record.courseCode || !record.url) continue;
    const bucket = byPrimary.get(record.courseCode);
    if (bucket) bucket.push(record);
    else byPrimary.set(record.courseCode, [record]);
  }

  const conflicts = [];
  for (const [code, bucket] of byPrimary) {
    const distinctCodesInBucket = bucket.filter((r) => r.url);
    const urls = new Set(distinctCodesInBucket.map((r) => r.url));
    if (urls.size > 1) {
      conflicts.push({
        courseCode: code,
        candidates: distinctCodesInBucket.map((r) => ({
          row: r.row,
          courseTitle: r.courseTitle,
          courseCode: r.courseCode,
          url: r.url,
          urlSource: r.urlSource,
        })),
        reason: 'same-course-code-maps-to-multiple-urls',
      });
    }
  }

  stats.distinctCodes = byPrimary.size;
  stats.distinctUrls = new Set(records.map((r) => r.url).filter(Boolean)).size;
  stats.duplicateCodes = [...byPrimary.values()].filter((b) => b.length > 1).length;
  stats.conflictCodes = conflicts.length;

  return { records, byCode, byTitle, conflicts, stats };
}
