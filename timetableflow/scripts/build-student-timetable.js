/**
 * Build a personalized student timetable from the NORMALIZED dataset.
 *
 * Phase 6 boundary: this script reads output/timetableflow.normalized.json — it
 * never opens an Excel file.
 *
 *   node scripts/build-student-timetable.js --courses "IFT 211,SEN 306" \
 *        [--data output/timetableflow.normalized.json] [--student "Ada Obi"] \
 *        [--out output/student] [--title "My timetable"] \
 *        [--from 2026-09-01] [--to 2026-09-30]
 *
 * Writes: student-timetable.json, student-timetable.html, student-timetable.ics
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { selectCourses } from '../src/student/selection.js';
import { buildStudentTimetable } from '../src/student/timetable.js';
import { buildViewModel } from '../src/render/viewModel.js';
import { renderHtml } from '../src/render/html.js';
import { toICalendar } from '../src/export/ical.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = {
    data: path.join(ROOT, 'output', 'timetableflow.normalized.json'),
    out: path.join(ROOT, 'output', 'student'),
    courses: '',
    student: null,
    title: 'Student Timetable',
    from: null,
    to: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--courses') { args.courses = value ?? ''; i += 1; }
    else if (flag === '--data') { args.data = value; i += 1; }
    else if (flag === '--out') { args.out = value; i += 1; }
    else if (flag === '--student') { args.student = value ?? null; i += 1; }
    else if (flag === '--title') { args.title = value ?? args.title; i += 1; }
    else if (flag === '--from') { args.from = value ?? null; i += 1; }
    else if (flag === '--to') { args.to = value ?? null; i += 1; }
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (!args.courses.trim()) {
    throw new Error('Missing --courses "CODE 1,CODE 2" (course codes from the normalized dataset)');
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

const payload = JSON.parse(await readFile(args.data, 'utf8'));
let entries = payload.entries ?? [];
if (args.from) entries = entries.filter((entry) => entry.date && entry.date >= args.from);
if (args.to) entries = entries.filter((entry) => entry.date && entry.date <= args.to);

const codes = args.courses.split(',').map((code) => code.trim()).filter(Boolean);
const selection = selectCourses(entries, codes);

if (!selection.entries.length) {
  console.error(
    JSON.stringify(
      { error: 'no-entries-matched', requested: codes, unmatched: selection.unmatched },
      null,
      2,
    ),
  );
  process.exit(1);
}

const timetable = buildStudentTimetable(selection.entries, {
  student: args.student,
  selection: selection.requested.map((item) => item.normalized),
});

const viewModel = buildViewModel(timetable, {
  title: args.title,
  courses: selection.courses,
});

const html = renderHtml(viewModel);
const { ics, events, skipped } = toICalendar(timetable.entries, {
  student: args.student,
  calendarName: args.title,
});

await mkdir(args.out, { recursive: true });
const jsonPath = path.join(args.out, 'student-timetable.json');
const htmlPath = path.join(args.out, 'student-timetable.html');
const icsPath = path.join(args.out, 'student-timetable.ics');

await writeFile(jsonPath, `${JSON.stringify({ viewModel, selection: selection.stats, unmatched: selection.unmatched }, null, 2)}\n`, 'utf8');
await writeFile(htmlPath, html, 'utf8');
await writeFile(icsPath, ics, 'utf8');

console.log(
  JSON.stringify(
    {
      source: path.relative(ROOT, args.data),
      window: [args.from, args.to],
      requested: codes,
      unmatched: selection.unmatched,
      stats: selection.stats,
      timetable: {
        lessons: timetable.summary.lessons,
        courses: timetable.summary.courses,
        days: timetable.summary.days,
        dateRange: [timetable.summary.firstDate, timetable.summary.lastDate],
        linkStates: timetable.summary.linkStates,
        conflicts: timetable.summary.conflictPairs,
      },
      ics: { events: events.length, skipped: skipped.length },
      out: [jsonPath, htmlPath, icsPath].map((p) => path.relative(ROOT, p)),
    },
    null,
    2,
  ),
);
