/**
 * Normalized TimetableEntry model.
 *
 * Every field is either derived from the real MIVA timetable or explicitly null.
 * Fields the source does not carry (programme, level, lecturer, semester, per-session
 * topic) are NOT part of the model — see TIMETABLE_STRUCTURE.md §8.
 */

export const ENTRY_FIELDS = [
  'courseCode',
  'courseCodes',
  'courseTitle',
  'rawCellText',
  'date',
  'day',
  'dayRaw',
  'weekLabel',
  'weekIndex',
  'startTime',
  'endTime',
  'slotLabel',
  'lessonUrl',
  'match',
  'sourceSheet',
  'sourceRow',
  'sourceColumn',
  'sourceCell',
  'warnings',
];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const URL_PATTERN = /^https?:\/\/\S+$/i;

/**
 * Structural validation of one normalized entry.
 * @returns {string[]} list of problems (empty when valid)
 */
export function validateEntry(entry) {
  const errors = [];
  if (!entry || typeof entry !== 'object') return ['entry-is-not-an-object'];

  for (const field of ['courseCode', 'courseTitle', 'sourceSheet', 'sourceRow', 'sourceColumn']) {
    if (entry[field] === null || entry[field] === undefined || entry[field] === '') {
      errors.push(`missing-required-field:${field}`);
    }
  }

  if (entry.courseCodes && (!Array.isArray(entry.courseCodes) || entry.courseCodes.length === 0)) {
    errors.push('courseCodes-empty');
  }
  if (entry.date !== null && !DATE_PATTERN.test(entry.date)) errors.push(`bad-date:${entry.date}`);
  if (entry.startTime !== null && !TIME_PATTERN.test(entry.startTime)) {
    errors.push(`bad-startTime:${entry.startTime}`);
  }
  if (entry.endTime !== null && !TIME_PATTERN.test(entry.endTime)) {
    errors.push(`bad-endTime:${entry.endTime}`);
  }
  if (entry.startTime && entry.endTime && entry.endTime <= entry.startTime) {
    errors.push('end-before-start');
  }
  if (entry.lessonUrl !== null && entry.lessonUrl !== undefined && !URL_PATTERN.test(entry.lessonUrl)) {
    errors.push(`bad-lessonUrl:${entry.lessonUrl}`);
  }
  if (entry.match && entry.match.ambiguous && entry.lessonUrl) {
    errors.push('conflict-must-not-pick-a-url');
  }
  return errors;
}

/** Validate a collection. @returns {{valid:number, invalid:Array<{index:number, errors:string[]}>}} */
export function validateEntries(entries) {
  const invalid = [];
  entries.forEach((entry, index) => {
    const errors = validateEntry(entry);
    if (errors.length) invalid.push({ index, sourceCell: entry.sourceCell, errors });
  });
  return { valid: entries.length - invalid.length, invalid };
}

/** Projection used by the UI / exporters: templates never see Excel specifics. */
export function toPublicEntry(entry) {
  return {
    courseCode: entry.courseCode,
    courseCodes: entry.courseCodes,
    courseTitle: entry.courseTitle,
    date: entry.date,
    day: entry.day,
    startTime: entry.startTime,
    endTime: entry.endTime,
    slotLabel: entry.slotLabel,
    lessonUrl: entry.lessonUrl,
    matchTier: entry.match?.tier ?? null,
    ambiguous: entry.match?.ambiguous ?? false,
    sourceSheet: entry.sourceSheet,
    sourceRow: entry.sourceRow,
    sourceColumn: entry.sourceColumn,
  };
}

/**
 * Lossless dataset projection — the JSON contract Phase 6 consumes.
 *
 * Keeps everything the student phase needs (including the conflict/ambiguity
 * metadata so a conflicted entry still reads as 'needs-verification' after a
 * JSON round-trip) plus the provenance fields for auditability.
 */
export function toDatasetEntry(entry) {
  const match = entry.match ?? {};
  const dataset = {
    courseCode: entry.courseCode,
    courseCodes: entry.courseCodes,
    courseTitle: entry.courseTitle,
    rawCellText: entry.rawCellText,
    date: entry.date,
    day: entry.day,
    dayRaw: entry.dayRaw ?? null,
    weekLabel: entry.weekLabel ?? null,
    weekIndex: entry.weekIndex ?? null,
    startTime: entry.startTime,
    endTime: entry.endTime,
    slotLabel: entry.slotLabel ?? null,
    lessonUrl: entry.lessonUrl ?? null,
    match: {
      tier: match.tier ?? null,
      rule: match.rule ?? null,
      linkRow: match.linkRow ?? null,
      linkTitle: match.linkTitle ?? null,
      ambiguous: match.ambiguous === true,
      titleMismatch: match.titleMismatch === true,
    },
    conflict: match.conflict ?? null,
    warnings: entry.warnings ?? [],
    sourceSheet: entry.sourceSheet,
    sourceRow: entry.sourceRow,
    sourceColumn: entry.sourceColumn,
    sourceCell: entry.sourceCell,
  };
  if (match.candidates && match.candidates.length > 1) dataset.candidates = match.candidates;
  return dataset;
}
