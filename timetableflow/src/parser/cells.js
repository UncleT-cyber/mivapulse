/**
 * Merge-aware cell reading.
 *
 * Excel merged ranges: only the top-left cell really holds the value. The parser
 * MUST ignore the covered positions, otherwise the title row (B1:E1) would be read
 * three extra times in the slot columns and the week/day labels would be counted
 * once per covered row (the real workbook merges A2:A88 and B3:B25 style ranges).
 *
 * openpyxl (used for the reconnaissance baseline) exposes covered cells as empty;
 * exceljs proxies them to the master cell. This module normalizes the difference so
 * both readings agree cell-for-cell.
 */

const cache = new WeakMap();

function parseAddress(address) {
  const match = /^([A-Z]+)(\d+)$/.exec(address);
  if (!match) return null;
  let col = 0;
  for (const char of match[1]) col = col * 26 + (char.charCodeAt(0) - 64);
  return { row: Number(match[2]), col };
}

function buildCoveredSet(sheet) {
  const set = new Set();
  for (const range of sheet.model?.merges ?? []) {
    const [start, end] = String(range).split(':');
    const from = parseAddress(start.trim());
    const to = parseAddress((end ?? start).trim());
    if (!from || !to) continue;
    for (let row = Math.min(from.row, to.row); row <= Math.max(from.row, to.row); row += 1) {
      for (let col = Math.min(from.col, to.col); col <= Math.max(from.col, to.col); col += 1) {
        if (row === from.row && col === from.col) continue; // master keeps its value
        set.add(`${row}:${col}`);
      }
    }
  }
  return set;
}

/** Set of 'row:col' keys covered by a merge but not holding the value. */
export function coveredCells(sheet) {
  let set = cache.get(sheet);
  if (!set) {
    set = buildCoveredSet(sheet);
    cache.set(sheet, set);
  }
  return set;
}

/** True when the cell is inside a merged range but is not the top-left cell. */
export function isCovered(sheet, row, col) {
  return coveredCells(sheet).has(`${row}:${col}`);
}

/**
 * Raw cell value with merge semantics applied.
 * Covered positions read as null/undefined, exactly like the reconnaissance baseline.
 */
export function rawCellValue(sheet, row, col) {
  if (isCovered(sheet, row, col)) return null;
  return sheet.getCell(row, col).value;
}

/** Cell value as trimmed display text, or null when there is nothing to read. */
export function cellText(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text;
    if (typeof value.result === 'string') return value.result;
    if (typeof value.formula === 'string') return `=${value.formula}`;
    return null;
  }
  return String(value);
}

/** Merge-aware text read used by every parser surface. */
export function readText(sheet, row, col) {
  return cellText(rawCellValue(sheet, row, col));
}
