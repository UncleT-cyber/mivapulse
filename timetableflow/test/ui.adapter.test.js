/**
 * Phase 7 — upload boundary: file bytes -> normalized dataset.
 *
 * This is the only place the browser touches Excel, so every upload failure
 * mode gets an explicit, honest outcome (no generic "something went wrong").
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import ExcelJS from 'exceljs';

import {
  PARSE_STAGES,
  hasExcelJS,
  isSupportedFilename,
  loadWorkbookFromBytes,
  parseWorkbookBytes,
  setExcelJS,
} from '../src/app/excelAdapter.js';
import { buildFixtureBuffer } from './helpers/fixtureWorkbook.js';

function zipMagic() {
  return Buffer.from([0x50, 0x4b, 0x03, 0x04]);
}

async function workbookWithoutMivaStructure() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  sheet.getCell('A1').value = 'Just some notes';
  sheet.getCell('B2').value = 42;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function workbookWithLinkSheetOnly() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Live Lesson Links');
  sheet.getCell('A1').value = 'Courses Title';
  sheet.getCell('B1').value = 'Course Code';
  sheet.getCell('C1').value = 'Live Lesson Link';
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test('a missing Excel implementation fails with a dedicated error kind', async () => {
  setExcelJS(null);
  assert.equal(hasExcelJS(), false);
  await assert.rejects(
    () => parseWorkbookBytes(Buffer.from('anything'), { filename: 'x.xlsx' }),
    (error) => error.kind === 'exceljs-unavailable',
  );
  setExcelJS(ExcelJS);
  assert.equal(hasExcelJS(), true);
});

test('unsupported file names are rejected before anything is read', () => {
  assert.equal(isSupportedFilename('MIVA.xlsx'), true);
  assert.equal(isSupportedFilename('timetable.XLSX'), true);
  assert.equal(isSupportedFilename('timetable.csv'), false);
  assert.equal(isSupportedFilename('timetable.pdf'), false);
  assert.equal(isSupportedFilename(null), false);
});

test('a valid workbook parses into the normalized dataset with honest stages', async () => {
  const stages = [];
  const dataset = await parseWorkbookBytes(await buildFixtureBuffer(), {
    filename: 'MIVA Master.xlsx',
    onStage: (stage) => stages.push(stage.id),
  });

  assert.equal(dataset.entries.length, 18);
  assert.ok(dataset.stats.scannedCells > 0);
  assert.ok(Array.isArray(dataset.warnings));
  assert.deepEqual(stages, PARSE_STAGES.map((stage) => stage.id));
});

test('a non-xlsx payload reports "invalid file"', async () => {
  await assert.rejects(
    () => parseWorkbookBytes(Buffer.from('PK not really a zip'), { filename: 'MIVA.xlsx' }),
    (error) => error.kind === 'invalid-file',
  );
  await assert.rejects(
    () => parseWorkbookBytes(Buffer.from('spreadsheet, honestly'), { filename: 'timetable.csv' }),
    (error) => error.kind === 'invalid-file',
  );
});

test('a corrupt workbook reports "unreadable"', async () => {
  const corrupt = Buffer.concat([zipMagic(), Buffer.from('this central directory is a lie')]);
  await assert.rejects(
    () => parseWorkbookBytes(corrupt, { filename: 'MIVA.xlsx' }),
    (error) => error.kind === 'unreadable',
  );
});

test('a spreadsheet without the MIVA structure reports "invalid file"', async () => {
  const bytes = await workbookWithoutMivaStructure();
  await assert.rejects(
    () => parseWorkbookBytes(bytes, { filename: 'notes.xlsx' }),
    (error) => error.kind === 'invalid-file',
  );
});

test('a timetable with no lessons reports "no lessons found"', async () => {
  const bytes = await workbookWithLinkSheetOnly();
  await assert.rejects(
    () => parseWorkbookBytes(bytes, { filename: 'empty.xlsx' }),
    (error) => error.kind === 'no-lessons',
  );
});

test('the adapter loads a workbook from bytes without any filesystem access', async () => {
  const buffer = await buildFixtureBuffer();
  const workbook = await loadWorkbookFromBytes(new Uint8Array(buffer));
  assert.ok(Array.isArray(workbook.worksheets));
  assert.ok(workbook.worksheets.length > 0);
});
