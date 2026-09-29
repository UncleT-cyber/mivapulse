/**
 * Application-level copy shared by the Excel adapter and the UI.
 *
 * Kept out of the adapter so presentation modules can show honest error text
 * without importing any Excel/workbook code (the kinds are plain strings).
 */

/** Stage labels shown while a workbook is being processed (one per real step). */
export const PARSE_STAGES = [
  { id: 'reading', label: 'Reading timetable…' },
  { id: 'courses', label: 'Finding courses…' },
  { id: 'links', label: 'Resolving lesson links…' },
  { id: 'building', label: 'Building your timetable…' },
];

export const PARSE_ERRORS = {
  'exceljs-unavailable': {
    kind: 'exceljs-unavailable',
    message: 'TimetableFlow could not start the timetable reader. Reload the page and try again.',
  },
  'invalid-file': {
    kind: 'invalid-file',
    message: "This doesn't appear to be a supported MIVA timetable.",
  },
  unreadable: {
    kind: 'unreadable',
    message: "We couldn't read this timetable file.",
  },
  'no-lessons': {
    kind: 'no-lessons',
    message: 'No timetable lessons were found in this file.',
  },
};

export function parseErrorCopy(kind, fallback = PARSE_ERRORS.unreadable.message) {
  return PARSE_ERRORS[kind]?.message ?? fallback;
}
