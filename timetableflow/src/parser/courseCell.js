/**
 * Course-cell parsing.
 *
 * Source of truth: reference/miva-master-timetable/TIMETABLE_STRUCTURE.md §3.
 *
 * On the current-format MIVA timetable a course lives in ONE cell of column C/D/E
 * as:  <course code> <separator> <course title>
 * The separator is a hyphen in (almost) every observed cell. Code and title are
 * never in separate columns (that only happens on the legacy cohort sheets).
 *
 * Two documented rules, no fuzzy matching anywhere:
 *
 *   1. strict   <code> ' - ' <title>                     (the normal case)
 *   2. recovery <code> <whitespace> <title>              (missing separator —
 *                observed once: November 2025!E40 'MIVA-PAD 211\tFoundations…',
 *                recovered deterministically on the course-code boundary and
 *                flagged with `recovered: true`)
 *
 * Time headers, the stray '-' marker and junk cells are rejected in both rules.
 */

/**
 * Leading course code of a cell, optionally a slash-combined pair.
 * Examples that MUST match:
 *   'IFT 211 - Digital Logic Design '
 *   'CSS 203- Comparative Police and Policing Systems'
 *   'MIVA-ACC 316- Intermediate Accounting II'
 *   'IFT 410\t - System Integration and Architecture'
 *   'BUA 203/ENT 125 - Business Statistics '
 *   'STA 111/ MIVA-ECO 105 - Descriptive Statistics '
 * Examples that MUST NOT match (headers / markers / junk):
 *   '3:00 - 4:00 pm'   '-'   '   '   'NNNNNNNN…'
 */
export const COURSE_CELL_PATTERN =
  /^\s*((?:MIVA[\s\-_])?[A-Z]{2,4}\s*\d{3}(?:\s*\/\s*(?:MIVA[\s\-_])?[A-Z]{2,4}\s*\d{3})*)\s*[-–—]\s*(.*)$/;

/**
 * Recovery rule for a course cell that lost its '-' separator: a valid course code
 * at the start of the cell, whitespace, then a non-empty title.
 *
 *   'MIVA-PAD 211\tFoundations of Political Economy'
 *     -> code 'MIVA-PAD 211', title 'Foundations of Political Economy'
 *
 * This is not fuzzy parsing: no digit/letter transposition and no prefix guessing —
 * only the course-code boundary decides. Time headers and junk still fall through
 * to rejection because they never start with a course code.
 */
export const COURSE_WITHOUT_SEPARATOR_PATTERN =
  /^\s*((?:MIVA[\s\-_])?[A-Z]{2,4}\s*\d{3}(?:\s*\/\s*(?:MIVA[\s\-_])?[A-Z]{2,4}\s*\d{3})*)\s+(\S.*)$/;

/** Tabs, newlines and repeated whitespace collapse to a single space; ends trimmed. */
export function collapseWhitespace(value) {
  return String(value)
    .replace(/[\t\n\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Canonical course-code form used for display and for joining.
 * Rules (mirror the reconnaissance baseline exactly):
 *   - upper-case
 *   - '_' -> '-'              (MIVA_PAD 208  -> MIVA_PAD 208 -> MIVA-PAD 208)
 *   - whitespace runs -> one space
 *   - leading 'MIVA ' / 'MIVA-' -> 'MIVA-'   (MIVA ECO 105 -> MIVA-ECO 105)
 *   - spaces around '/' are PRESERVED  ('STA 111/ MIVA-ECO 105' stays as-is)
 */
export function normalizeCourseCode(raw) {
  let code = String(raw).toUpperCase().replace(/_/g, '-').replace(/\s+/g, ' ').trim();
  code = code.replace(/^MIVA[\s\-]?/, 'MIVA-');
  return code;
}

/** 'MIVA-NSC 512' -> 'NSC 512'. Prefix only stripped when it leads the string. */
export function stripMivaPrefix(code) {
  return String(code).replace(/^MIVA[\s\-]?/, '').trim();
}

/** Split a (possibly slash-combined) code into its normalized parts. */
export function splitCourseCodes(code) {
  return String(code)
    .split('/')
    .map((part) => normalizeCourseCode(part))
    .filter(Boolean);
}

function ok(courseCodeRaw, courseTitleRaw, rawCellText, recovered) {
  const courseCode = normalizeCourseCode(courseCodeRaw);
  const courseTitle = collapseWhitespace(courseTitleRaw);
  if (!courseTitle) return { ok: false, reason: 'missing-title', rawCellText };
  const result = {
    ok: true,
    courseCode,
    courseCodes: splitCourseCodes(courseCode),
    courseTitle,
    rawCellText,
  };
  if (recovered) result.recovered = true;
  return result;
}

/**
 * @returns {{ok: true, courseCode: string, courseCodes: string[], courseTitle: string,
 *            rawCellText: string, recovered?: true}
 *          | {ok: false, reason: string, rawCellText: string}}
 */
export function parseCourseCell(value) {
  if (value === null || value === undefined) {
    return { ok: false, reason: 'empty', rawCellText: '' };
  }
  const rawCellText = String(value);
  if (rawCellText.trim() === '') {
    return { ok: false, reason: 'blank', rawCellText };
  }

  // rule 1 — strict 'CODE - Title'
  const strict = COURSE_CELL_PATTERN.exec(rawCellText);
  if (strict) return ok(strict[1], strict[2], rawCellText, false);

  // rule 2 — recovery: 'CODE<whitespace>Title' (deterministic, code-boundary based)
  const loose = COURSE_WITHOUT_SEPARATOR_PATTERN.exec(rawCellText);
  if (loose) return ok(loose[1], loose[2], rawCellText, true);

  const collapsed = collapseWhitespace(rawCellText);
  let reason = 'not-a-course-cell';
  if (/^\d{1,2}:\d{2}\s*-/.test(collapsed)) reason = 'time-header';
  else if (collapsed === '-') reason = 'stray-marker';
  return { ok: false, reason, rawCellText };
}
