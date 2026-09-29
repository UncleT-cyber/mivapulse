/**
 * Phase 7 architectural rules — enforced as tests, not conventions.
 *
 * The UI is a presentation layer over the Phases 1-6 engine:
 *   - presentation modules (src/ui/**) never touch Excel, the filesystem or the
 *     workbook pipeline
 *   - the browser glue (public/app.js) may reach the application adapter, but
 *     still not node:fs (file handling goes through File/Blob APIs)
 *   - the Excel implementation is imported in exactly one place: src/index.js
 *     (CLI) — plus the injected application adapter
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function read(relativePath) {
  return readFile(path.join(ROOT, relativePath), 'utf8');
}

function importSpecifiers(source) {
  return collectImportSpecifiers(source);
}

/** Collect every static, side-effect and dynamic import specifier in a module. */
function collectImportSpecifiers(source) {
  const specs = [];
  const patterns = [
    /(?:import|export)\s[^;'"]*?from\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    let match = pattern.exec(source);
    while (match) {
      specs.push(match[1]);
      match = pattern.exec(source);
    }
  }
  return specs;
}

/** Follow the browser import graph from public/app.js (plus index.html modules). */
async function browserModuleGraph() {
  const seen = new Set();
  const queue = ['public/app.js'];

  const html = await read('public/index.html');
  for (const spec of collectImportSpecifiers(html)) {
    if (spec.startsWith('/')) queue.push(spec.slice(1));
  }

  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);

    const source = await read(file);
    for (const spec of collectImportSpecifiers(source)) {
      if (/^node:/.test(spec) || /^exceljs$/.test(spec)) continue; // flagged by the test below
      if (spec.startsWith('/')) queue.push(spec.slice(1));
      else if (spec.startsWith('.')) queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)));
      else queue.push(spec); // bare specifier — flagged below
    }
  }
  return seen;
}

async function uiModuleFiles() {
  const entries = await readdir(path.join(ROOT, 'src', 'ui'));
  return entries.filter((name) => name.endsWith('.js')).map((name) => `src/ui/${name}`);
}

test('presentation modules import no Excel, no filesystem, no workbook pipeline', async () => {
  const forbiddenSpecifiers = [
    /^exceljs$/,
    /node:fs/,
    /\.\.\/app\/excelAdapter\.js$/,
    /\.\.\/pipeline\.js$/,
    /\.\.\/index\.js$/,
  ];
  const forbiddenCalls = [
    'loadWorkbook',
    'processWorkbook',
    'parseWorkbook',
    'classifyWorkbook',
    'buildLinkIndex',
    'parseTimetableSheet',
    'readFile',
    'writeFile',
  ];
  const forbiddenContent = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'ExcelJS', 'worksheet'];

  for (const file of await uiModuleFiles()) {
    const source = await read(file);
    for (const spec of importSpecifiers(source)) {
      for (const forbidden of forbiddenSpecifiers) {
        assert.ok(!forbidden.test(spec), `${file} imports forbidden module "${spec}"`);
      }
    }
    for (const call of forbiddenCalls) {
      assert.ok(!source.includes(call), `${file} references pipeline function "${call}"`);
    }
    for (const token of forbiddenContent) {
      assert.ok(!source.includes(token), `${file} contains forbidden token "${token}"`);
    }
  }
});

test('the browser glue only reaches the application adapter and presentation modules', async () => {
  const source = await read('public/app.js');
  const specs = importSpecifiers(source);

  assert.ok(specs.length > 0, 'glue should be modular');
  for (const spec of specs) {
    assert.ok(!/^exceljs$/.test(spec), `app.js imports exceljs directly: ${spec}`);
    assert.ok(!/node:fs/.test(spec), `app.js touches the filesystem: ${spec}`);
    assert.ok(
      spec.startsWith('/src/') || spec.startsWith('/public/'),
      `app.js must import from the served project modules: ${spec}`,
    );
  }
  assert.ok(specs.includes('/src/app/excelAdapter.js'), 'glue wires the Excel adapter');
  assert.ok(specs.includes('/src/ui/state.js'), 'glue drives the pure state machine');
});

test('application modules never use node:fs (browser-safe)', async () => {
  const entries = await readdir(path.join(ROOT, 'src', 'app'));
  for (const name of entries.filter((n) => n.endsWith('.js'))) {
    const source = await read(`src/app/${name}`);
    assert.ok(!/node:fs/.test(source), `src/app/${name} touches the filesystem`);
    assert.ok(!/^exceljs$/m.test(importSpecifiers(source).join('\n')), `src/app/${name} imports exceljs`);
  }
});

test('exceljs is imported by the CLI entry point only', async () => {
  const offenders = [];
  const check = async (file) => {
    const source = await read(file);
    if (importSpecifiers(source).includes('exceljs')) offenders.push(file);
  };

  const cliEntry = await read('src/index.js');
  assert.ok(importSpecifiers(cliEntry).includes('exceljs'), 'the CLI entry point reads workbooks');

  for (const dir of ['src/ui', 'src/app', 'src/render', 'src/student', 'src/export', 'src/links', 'src/model', 'src']) {
    const entries = await readdir(path.join(ROOT, dir)).catch(() => []);
    for (const name of entries.filter((n) => n.endsWith('.js'))) {
      const file = `${dir}/${name}`;
      if (file === 'src/index.js') continue;
      await check(file);
    }
  }
  assert.deepEqual(offenders, []);
});

test('the UI delegates matching, conflicts and calendar work to the engine', async () => {
  const state = await read('src/ui/state.js');
  for (const engineCall of ['selectCourses', 'buildStudentTimetable', 'buildViewModel', 'toICalendar']) {
    assert.ok(state.includes(engineCall), `state machine must delegate ${engineCall}`);
  }
  // no second implementation of the engine's rules inside the UI
  for (const ownImplementation of ['function selectCourses', 'function buildStudentTimetable', 'function toICalendar', 'overlapMinutes =']) {
    assert.ok(!state.includes(ownImplementation), `UI must not reimplement "${ownImplementation}"`);
  }
});

test('the browser module graph has no Node-only dependencies', async () => {
  const graph = await browserModuleGraph();
  assert.ok(graph.size >= 8, `the browser graph should be modular, saw ${graph.size} modules`);

  for (const file of graph) {
    assert.ok(
      existsSync(path.join(ROOT, file)),
      `${file} is imported by the browser but does not exist (blank screen)`,
    );
    const source = await read(file);
    for (const spec of collectImportSpecifiers(source)) {
      assert.ok(!spec.startsWith('node:'), `${file} imports Node built-in "${spec}" — the browser cannot load it`);
      assert.ok(!/^(exceljs|fs|path|crypto|os|util)$/.test(spec), `${file} imports bare module "${spec}"`);
    }
    assert.ok(!/\bBuffer\s*\./.test(source), `${file} uses Buffer — not available in the browser`);
    assert.ok(!/\bprocess\s*\./.test(source), `${file} uses process — not available in the browser`);
    assert.ok(!/\brequire\s*\(/.test(source), `${file} uses CommonJS require`);
  }
});
