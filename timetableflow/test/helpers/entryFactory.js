/** Builders for normalized TimetableFlow entries — no workbook involved. */

let counter = 0;

/**
 * @param {object} overrides
 * @returns {object} a structurally valid normalized entry
 */
export function makeEntry(overrides = {}) {
  counter += 1;
  const courseCode = overrides.courseCode ?? 'IFT 211';
  const {
    courseCodes = [courseCode],
    courseTitle = 'Digital Logic Design',
    date = '2026-09-14',
    day = 'Monday',
    startTime = '15:00',
    endTime = '16:00',
    slotLabel = '3:00 - 4:00 pm',
    lessonUrl = 'https://meet.google.com/aaa-bbbb-ccc',
    match = {
      tier: 'exact',
      rule: 'exact-course-code',
      ambiguous: false,
      titleMismatch: false,
      linkTitle: courseTitle,
      candidates: [],
      conflict: null,
    },
    warnings = [],
    sourceSheet = 'Fixture Sep 2026 Lesson Time',
    sourceRow = 10 + counter,
    sourceColumn = 'C',
    weekIndex = 1,
    ...rest
  } = overrides;

  return {
    courseCode,
    courseCodes,
    courseTitle,
    rawCellText: `${courseCode} - ${courseTitle}`,
    date,
    day,
    dayRaw: day ? `${day} ${date?.split('-').reverse().join('/')}` : null,
    weekLabel: 'Week 1',
    weekIndex,
    startTime,
    endTime,
    slotLabel,
    lessonUrl,
    match,
    sourceSheet,
    sourceRow,
    sourceColumn,
    sourceCell: `${sourceColumn}${sourceRow}`,
    warnings,
    ...rest,
  };
}

/** An entry whose code maps to two different live-lesson URLs (NSC 309 pattern). */
export function makeConflictedEntry(overrides = {}) {
  const a = 'http://meet.google.com/conflict-a';
  const b = 'http://meet.google.com/conflict-b';
  return makeEntry({
    courseCode: 'NSC 309',
    courseCodes: ['NSC 309'],
    courseTitle: 'Nursing Ethics and Jurisprudence',
    lessonUrl: null,
    match: {
      tier: 'exact',
      rule: 'exact-course-code',
      ambiguous: true,
      titleMismatch: false,
      linkTitle: null,
      candidates: [
        { row: 4, courseCode: 'NSC 309', courseTitle: 'Nursing Ethics and Jurisprudence', url: a, urlSource: 'hyperlink' },
        { row: 5, courseCode: 'NSC 309', courseTitle: 'Developmental Psychology', url: b, urlSource: 'hyperlink' },
      ],
      conflict: {
        courseCode: 'NSC 309',
        reason: 'same-course-code-maps-to-multiple-urls',
        candidates: [
          { url: a, rows: [4], titles: ['Nursing Ethics and Jurisprudence'] },
          { url: b, rows: [5], titles: ['Developmental Psychology'] },
        ],
      },
    },
    ...overrides,
  });
}

/** An entry with no joined link at all. */
export function makeUnlinkedEntry(overrides = {}) {
  return makeEntry({
    lessonUrl: null,
    match: {
      tier: 'none',
      rule: 'no-match',
      ambiguous: false,
      titleMismatch: false,
      linkTitle: null,
      candidates: [],
      conflict: null,
    },
    ...overrides,
  });
}
