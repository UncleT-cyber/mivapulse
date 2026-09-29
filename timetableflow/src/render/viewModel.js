/**
 * View model — the exact shape the template renderer receives.
 *
 * Deliberately free of Excel concepts: no sheet names, no cell addresses, no raw
 * cell text. Templates render this and nothing else.
 */

import { linkState, linkStateReason } from '../student/timetable.js';

function publicLink(entry) {
  const state = linkState(entry);
  const reason = linkStateReason(entry);
  const link = {
    state,
    reason,
    url: state === 'verified' ? entry.lessonUrl : null,
    // evidence for review, never presented as a resolved join link
    candidateUrl: state === 'needs-verification' ? entry.lessonUrl ?? null : null,
    linkTitle: entry.match?.titleMismatch === true ? entry.match?.linkTitle ?? null : null,
  };
  if (state === 'needs-verification') {
    // Underlying choices, surfaced as secondary detail in the UI — never picked for the student.
    // Excel row numbers stay behind the boundary: only displayable facts are projected.
    const conflict = entry.match?.conflict ?? entry.conflict ?? null;
    link.candidates = (conflict?.candidates ?? [])
      .filter((candidate) => candidate.url)
      .map((candidate) => ({
        url: candidate.url,
        titles: (candidate.titles ?? []).filter(Boolean),
      }));
  }
  return link;
}

function publicEntry(entry) {
  return {
    courseCode: entry.courseCode,
    courseTitle: entry.courseTitle,
    startTime: entry.startTime,
    endTime: entry.endTime,
    timeLabel: entry.startTime && entry.endTime ? `${entry.startTime} - ${entry.endTime}` : null,
    weekIndex: entry.weekIndex ?? null,
    link: publicLink(entry),
    titleMismatch: entry.match?.titleMismatch === true,
    recovered: entry.warnings?.includes('recovered-missing-separator') === true,
  };
}

/**
 * @param {object} timetable  output of buildStudentTimetable()
 * @param {{title?: string, courses?: Array}} [options]
 */
export function buildViewModel(timetable, options = {}) {
  const days = timetable.days.map((day) => ({
    date: day.date,
    day: day.day,
    entries: day.entries.map(publicEntry),
  }));

  return {
    title: options.title ?? 'Student Timetable',
    student: timetable.student,
    generatedAt: timetable.generatedAt,
    selection: timetable.selection,
    courses: options.courses ?? [],
    summary: {
      ...timetable.summary,
      linkStates: { ...timetable.summary.linkStates },
    },
    days,
    conflicts: timetable.conflicts.map((conflict) => ({
      date: conflict.date,
      day: conflict.day,
      overlapMinutes: conflict.overlapMinutes,
      entries: conflict.entries.map((entry) => ({ ...entry })),
    })),
    notes: buildNotes(timetable),
  };
}

function buildNotes(timetable) {
  const notes = [];
  const { linkStates } = timetable.summary;
  if (linkStates['needs-verification'] > 0) {
    const count = linkStates['needs-verification'];
    const reasons = { 'conflicting-candidates': 0, 'title-only-match': 0, 'title-mismatch': 0 };
    for (const entry of timetable.entries) {
      const reason = linkStateReason(entry);
      if (reason) reasons[reason] += 1;
    }
    const parts = [
      reasons['conflicting-candidates'] ? `${reasons['conflicting-candidates']} with more than one live-lesson URL` : '',
      reasons['title-only-match'] ? `${reasons['title-only-match']} matched by course title only` : '',
      reasons['title-mismatch'] ? `${reasons['title-mismatch']} with a different course title on the link row` : '',
    ].filter(Boolean);
    notes.push({
      kind: 'needs-verification',
      text: `${count} lesson link${count === 1 ? '' : 's'} ${count === 1 ? 'needs' : 'need'} verification: ${parts.join(', ')}.`,
    });
  }
  if (linkStates.missing > 0) {
    const count = linkStates.missing;
    notes.push({
      kind: 'missing-link',
      text: `${count} lesson${count === 1 ? '' : 's'} ${count === 1 ? 'has' : 'have'} no live-lesson link yet.`,
    });
  }
  if (timetable.conflicts.length > 0) {
    const count = timetable.conflicts.length;
    notes.push({
      kind: 'schedule-conflict',
      text: `${count} timetable conflict${count === 1 ? '' : 's'}: two selected lessons overlap.`,
    });
  }
  return notes;
}
