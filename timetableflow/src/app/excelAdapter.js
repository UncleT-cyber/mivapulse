/**
 * Application adapter: bytes -> normalized dataset.
 *
 * The ONLY place (besides the CLI entry point) that touches an Excel
 * implementation. Presentation modules (src/ui/**) must never import this
 * module's ExcelJS handling — they receive an already-normalized dataset.
 *
 * The ExcelJS implementation is injected rather than imported so the same
 * adapter runs:
 *   - in the browser, where the ExcelJS browser bundle is loaded as a classic
 *     script (window.ExcelJS) and cannot be imported as an ES module specifier
 *   - in Node tests, where the real exceljs package is passed in
 *
 * No filesystem access: files arrive as byte buffers (File.arrayBuffer()).
 */

import { processWorkbook } from '../pipeline.js';
import { PARSE_ERRORS, PARSE_STAGES } from './messages.js';

export { PARSE_STAGES, PARSE_ERRORS };

let ExcelJS = null;

/** Inject the Excel implementation (window.ExcelJS in the browser, exceljs in Node). */
export function setExcelJS(implementation) {
  ExcelJS = implementation?.Workbook ? implementation : implementation?.default ?? null;
}

export function hasExcelJS() {
  return Boolean(ExcelJS?.Workbook);
}

export function parseError(kind) {
  const template = PARSE_ERRORS[kind] ?? PARSE_ERRORS.unreadable;
  const error = new Error(template.message);
  error.kind = template.kind;
  return error;
}

/** XLSX files are zip containers: they must start with the local-file-header magic. */
function looksLikeZip(bytes) {
  const view = new Uint8Array(bytes);
  return view.length > 3 && view[0] === 0x50 && view[1] === 0x4b && (view[2] === 0x03 || view[2] === 0x05 || view[2] === 0x07);
}

export function isSupportedFilename(filename) {
  return typeof filename === 'string' && /\.xlsx$/i.test(filename.trim());
}

/** Load an ExcelJS-compatible workbook from bytes. No filesystem involved. */
export async function loadWorkbookFromBytes(bytes) {
  if (!hasExcelJS()) throw parseError('exceljs-unavailable');
  if (!looksLikeZip(bytes)) throw parseError('invalid-file');

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes);
  } catch {
    throw parseError('unreadable');
  }
  return workbook;
}

/**
 * Bytes -> normalized dataset.
 *
 * @param {ArrayBuffer|Uint8Array} bytes
 * @param {{filename?: string, onStage?: (stage: {id: string, label: string}) => void}} [options]
 * @returns {Promise<object>} the normalized dataset (output of processWorkbook)
 * @throws {Error} with `.kind` in PARSE_ERRORS keys
 */
export async function parseWorkbookBytes(bytes, options = {}) {
  const { filename, onStage } = options;

  if (filename && !isSupportedFilename(filename)) throw parseError('invalid-file');
  if (!hasExcelJS()) throw parseError('exceljs-unavailable');

  const stages = PARSE_STAGES;
  const signal = async (index) => {
    if (!onStage) return;
    const stage = stages[index];
    if (stage) onStage(stage);
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  await signal(0);
  const workbook = await loadWorkbookFromBytes(bytes);

  await signal(1);
  await signal(2);
  let dataset;
  try {
    dataset = processWorkbook(workbook);
  } catch (error) {
    // The pipeline throws when the workbook has no MIVA link sheet at all:
    // that file is simply not a MIVA timetable. Anything else is a structural
    // read failure.
    if (String(error?.message ?? '').includes('Link source not found')) {
      throw parseError('invalid-file');
    }
    throw parseError('unreadable');
  }

  await signal(3);
  if (!dataset.entries.length) throw parseError('no-lessons');

  return dataset;
}
