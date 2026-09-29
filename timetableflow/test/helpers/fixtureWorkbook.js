/**
 * Fixture workbook builder.
 *
 * The fixture reproduces the STRUCTURE discovered in the real MIVA master timetable
 * (reference/miva-master-timetable/TIMETABLE_STRUCTURE.md) — including its
 * irregularities — so parser tests exercise the real format instead of an idealized
 * one. The original reference workbook is never modified.
 *
 * Mirrored quirks:
 *   - merged title B1:E1 that steals B2 in week 1 only
 *   - week 1: time-header row separate from the first Monday row
 *   - week 2: time-header row IS the Monday row
 *   - merged day ranges that end before the content does
 *   - blank separator rows, stray '-' marker, whitespace-only cell
 *   - 'Wednessday' typo, embedded tabs, trailing spaces
 *   - a second, different time-slot scheme in week 2
 *   - same-slot duplicate entries
 *   - slash-combined codes, MIVA_PAD / MIVA ECO spelling variants
 *   - link column using BOTH a hyperlink object and a HYPERLINK() formula
 *   - a legacy cohort sheet and an empty sheet that must be excluded
 */
import ExcelJS from 'exceljs';

const TIME_HEADERS_WEEK_1 = ['3:00 - 4:00 pm', '4:00 - 5:00 pm', '5:00 - 6:00 pm'];
const TIME_HEADERS_WEEK_2 = ['1:30 - 3:00 pm', '3:00 - 4:30 pm', '4:30 - 6:00 pm'];

export const FIXTURE_URLS = {
  ift211: 'https://meet.google.com/aaa-bbbb-ccc',
  sen306: 'http://meet.google.com/ddd-eeee-fff',
  pad213: 'https://meet.google.com/ggg-hhhh-iii',
  ift410: 'https://meet.google.com/jjj-kkkk-lll',
  pad208: 'https://meet.google.com/mmm-nnnn-ooo',
  mcm109: 'https://meet.google.com/ppp-qqqq-rrr',
  bua203: 'https://meet.google.com/sss-tttt-uuu',
  nsc512: 'https://meet.google.com/vvv-wwww-xxx',
  sta111: 'https://meet.google.com/yyy-zzzz-111',
  nsc309a: 'https://meet.google.com/conflict-a-001',
  nsc309b: 'https://meet.google.com/conflict-b-002',
  mcm101: 'https://meet.google.com/222-3333-444',
  acc306: 'https://meet.google.com/555-6666-777',
  eco313: 'https://meet.google.com/888-9999-000',
  css101: 'https://meet.google.com/css-101-000',
  ins204: 'https://meet.google.com/ins-204-000',
};

function setRow(sheet, rowNumber, values) {
  for (const [column, value] of Object.entries(values)) {
    sheet.getCell(`${column}${rowNumber}`).value = value;
  }
}

function buildTimetableSheet(workbook) {
  const sheet = workbook.addWorksheet('Fixture Sep 2026 Lesson Time');

  // row 1 — title (merged across B:E), F1 spacer; B2 is swallowed by the merge
  setRow(sheet, 1, { B: 'Live Lessons Time Table (September, 2026)', F: ' ' });

  // row 2 — week 1 header: week label + time slots, no day label
  setRow(sheet, 2, { A: 'Week 1 starting 14th September' });
  TIME_HEADERS_WEEK_1.forEach((label, i) => {
    sheet.getCell(`${String.fromCharCode(67 + i)}2`).value = label;
  });

  // row 3 — Monday block starts here
  setRow(sheet, 3, {
    B: 'Monday 14/09/2026',
    C: 'IFT 211 - Digital Logic Design ',
    D: 'SEN 306 - Software Construction',
    E: 'PAD 213 - Foreign Policy Making and Analysis',
  });
  // row 4 — still inside the (deliberately short) merge, tab inside the code
  setRow(sheet, 4, {
    C: 'IFT 410\t - System Integration and Architecture',
    D: 'MIVA_PAD 208 - Quantitative Methods for Decision Making',
  });
  // row 5 — OUTSIDE merge B3:B4 but still Monday (lying merged range)
  setRow(sheet, 5, { C: 'MIVA-MCM 109 - History and Development of Mass Communication ' });
  // row 6 — blank separator

  // row 7 — misspelled weekday + newline, combined code, prefix mismatch, conflict code
  setRow(sheet, 7, {
    B: 'Wednessday\n16/09/2026',
    C: 'BUA 203/ENT 125 - Business Statistics ',
    D: 'NSC 512 - Gerontology/Geriatric Nursing ',
    E: 'NSC 309 - Nursing Ethics and Jurisprudence',
  });
  // row 8 — differently-spaced combined code, miscoded cell (title fallback), no-space dash
  setRow(sheet, 8, {
    C: 'STA 111/ MIVA-ECO 105 - Descriptive Statistics ',
    D: 'CSC 101 - Introduction to Criminology and Security Studies',
    E: 'ACC 306- Taxation II',
  });
  // row 9 — blank separator

  // row 10 — week 2: week label + Monday day label + a DIFFERENT slot scheme in one row
  setRow(sheet, 10, { A: 'Week 2 starting 21st  September', B: 'Monday\n 21/09/2026' });
  TIME_HEADERS_WEEK_2.forEach((label, i) => {
    sheet.getCell(`${String.fromCharCode(67 + i)}10`).value = label;
  });

  // rows 11-12 — same-slot duplicate entries (same course, same day, same column)
  setRow(sheet, 11, { C: 'MCM 101 - Foundations of Broadcasting and Film ', D: 'PAD 302- Administrative Behaviour' });
  setRow(sheet, 12, { C: 'MCM 101 - Foundations of Broadcasting and Film ' });
  // row 13 — stray marker that must not reset the day context
  setRow(sheet, 13, { B: '-' });
  // row 14 — whitespace-only cell + a real course
  setRow(sheet, 14, { C: '   ', D: 'ECO 306- Introductory Econometrics' });
  // row 15 — Friday block
  setRow(sheet, 15, {
    B: 'Friday\n 25/09/2026',
    C: 'MIVA-ECO 313 - Research Methods in Economics',
    D: 'INS 204 - Systems Analysis and Design',
  });

  // merges written last so top-left values survive
  sheet.mergeCells('B1:E1');
  sheet.mergeCells('B3:B4');
  sheet.mergeCells('B7:B8');
  sheet.mergeCells('B10:B12');
  sheet.mergeCells('A2:A8');
  sheet.mergeCells('A10:A15');
  return sheet;
}

function buildLegacySheet(workbook) {
  const sheet = workbook.addWorksheet('Fixture September 2023');
  setRow(sheet, 1, { A: 'Back to Menu' });
  setRow(sheet, 2, { A: 'September 2023 Cohort' });
  setRow(sheet, 7, {
    C: 'Computer Science ',
    E: '10:00 - 11:00 am',
    F: '11:00 - 12:00 pm',
  });
  setRow(sheet, 8, { C: 'Monday', D: 'Course Title', E: 'Research Methodology and Technical Report Writing' });
  setRow(sheet, 9, { D: 'Course Code', E: 'COS 409' });
  setRow(sheet, 10, { D: 'Mode', E: 'Self-study' });
  return sheet;
}

function buildNotesSheet(workbook) {
  const sheet = workbook.addWorksheet('Fixture Notes');
  setRow(sheet, 1, { A: 'This sheet has content but no day labels and no slot headers.' });
  return sheet;
}

function buildEmptySheet(workbook) {
  return workbook.addWorksheet('Sheet20');
}

function buildLinkSheet(workbook) {
  const sheet = workbook.addWorksheet('Live Lesson Links');
  setRow(sheet, 1, { A: 'Courses Title', B: 'Course Code', C: 'Live Lesson Link' });

  const rows = [
    // mechanism 1 — embedded hyperlink object
    ['Digital Logic Design', 'IFT 211', { text: 'Link', hyperlink: FIXTURE_URLS.ift211 }],
    // mechanism 2 — HYPERLINK() formula
    ['Software Construction', 'SEN 306', { formula: `HYPERLINK("${FIXTURE_URLS.sen306}", "Link")`, result: 'Link' }],
    ['Foreign Policy Making and Analysis', 'PAD 213', { text: 'Link', hyperlink: FIXTURE_URLS.pad213 }],
    ['System Integration and Architecture', 'IFT 410', { text: 'Link', hyperlink: FIXTURE_URLS.ift410 }],
    ['Quantitative Methods for Decision Making', 'MIVA_PAD 208', { text: 'Link', hyperlink: FIXTURE_URLS.pad208 }],
    ['History and Development of Mass Communication', 'MIVA-MCM 109', { formula: `HYPERLINK("${FIXTURE_URLS.mcm109}","Link")`, result: 'Link' }],
    // slash-combined code stored combined in the link source
    ['Business Statistics', 'BUA 203/ENT 125', { text: 'Link', hyperlink: FIXTURE_URLS.bua203 }],
    ['Gerontology/Geriatric Nursing', 'MIVA-NSC 512', { text: 'Link', hyperlink: FIXTURE_URLS.nsc512 }],
    ['Descriptive Statistics', 'STA 111/MIVA ECO 105', { text: 'Link', hyperlink: FIXTURE_URLS.sta111 }],
    // conflicting URLs for one code (mirrors NSC 309 in the real workbook)
    ['Nursing Ethics and Jurisprudence', 'NSC 309', { text: 'Link', hyperlink: FIXTURE_URLS.nsc309a }],
    ['Developmental Psychology', 'NSC 309', { text: 'Link', hyperlink: FIXTURE_URLS.nsc309b }],
    ['Foundations of Broadcasting and Film', 'MCM 101', { text: 'Link', hyperlink: FIXTURE_URLS.mcm101 }],
    ['Taxation II', 'ACC 306', { formula: `HYPERLINK("${FIXTURE_URLS.acc306}", "Link")`, result: 'Link' }],
    ['Research Methods in Economics', 'ECO 313', { text: 'Link', hyperlink: FIXTURE_URLS.eco313 }],
    ['Introduction to Criminology and Security Studies', 'CSS 101', { text: 'Link', hyperlink: FIXTURE_URLS.css101 }],
    // combined link code; the timetable only ever shows one half of it
    ['Systems Analysis and Design', 'INS 204/MIVA-IFT 204', { text: 'Link', hyperlink: FIXTURE_URLS.ins204 }],
    // styled-but-empty rows must be ignored (real file has rows 579-1039 like this)
    [null, null, null],
    [null, null, null],
  ];

  rows.forEach((row, index) => {
    const r = index + 2;
    sheet.getCell(`A${r}`).value = row[0];
    sheet.getCell(`B${r}`).value = row[1];
    if (row[2] !== null) sheet.getCell(`C${r}`).value = row[2];
  });

  return sheet;
}

/** @returns {Promise<Buffer>} the fixture workbook as an xlsx buffer */
export async function buildFixtureBuffer() {
  const workbook = new ExcelJS.Workbook();
  buildEmptySheet(workbook);
  buildTimetableSheet(workbook);
  buildLegacySheet(workbook);
  buildNotesSheet(workbook);
  buildLinkSheet(workbook);
  return workbook.xlsx.writeBuffer();
}

/**
 * Minimal workbook used to exercise the separator-recovery rule at parser level
 * (mirrors November 2025!E40 of the real workbook).
 */
export async function buildRecoveryFixtureBuffer() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Fixture Sep 2025');
  sheet.getCell('A1').value = 'Week 1 starting 26th October';
  sheet.getCell('B1').value = 'Monday 26/10/2026';
  sheet.getCell('C1').value = '10:00 - 11:00 am';
  sheet.getCell('D1').value = '11:00 - 12:00 pm';
  sheet.getCell('C2').value = 'MIVA-PAD 211\tFoundations of Political Economy';
  sheet.getCell('D2').value = 'PAD 101 - Elements of Public Administration';
  return workbook.xlsx.writeBuffer();
}
