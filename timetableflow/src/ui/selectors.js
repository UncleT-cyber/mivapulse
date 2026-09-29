/**
 * UI selectors — derived facts only.
 *
 * Everything here is computed from the normalized dataset or the current UI
 * state. Nothing here reads Excel, and nothing here re-implements matching,
 * conflict detection or link resolution: those live in src/student.
 */

import { courseCatalog, selectCourses } from '../student/selection.js';
import { allPeriod, isProvisionalPeriod, periodOptions, sourceMonthFromDataset } from '../student/period.js';
import { googleLessonLink } from '../export/google.js';
import { linkState } from '../student/timetable.js';
import { formatPeriod } from './timetableBody.js';
import { STEPS } from './state.js';

/** How many catalogue rows the course list shows before asking to refine the search. */
export const CATALOG_LIMIT = 60;

const catalogCache = new WeakMap();
const summaryCache = new WeakMap();
const selectionCache = new WeakMap();
const periodCache = new WeakMap();

/** Course catalogue (code, titles, lesson count) derived from normalized entries. */
export function courseOptions(dataset) {
  if (!dataset?.entries) return [];
  const cached = catalogCache.get(dataset.entries);
  if (cached) return cached;
  const catalog = courseCatalog(dataset.entries);
  catalogCache.set(dataset.entries, catalog);
  return catalog;
}

function includes(haystack, needle) {
  return haystack.toUpperCase().includes(needle.toUpperCase());
}

/** Search by course code or title (case-insensitive substring). */
export function searchCourses(catalog, search) {
  const query = (search ?? '').trim();
  if (!query) return catalog;
  return catalog.filter(
    (course) =>
      includes(course.courseCode, query) ||
      includes(course.altCodes.join(' '), query) ||
      course.titles.some((title) => includes(title, query)),
  );
}

/** Factual summary of the uploaded dataset (upload screen). */
export function summarizeDataset(dataset) {
  if (!dataset?.entries) return null;
  const cached = summaryCache.get(dataset.entries);
  if (cached) return cached;

  const linkStates = { verified: 0, 'needs-verification': 0, missing: 0 };
  for (const entry of dataset.entries) linkStates[linkState(entry)] += 1;
  const dates = dataset.entries.map((entry) => entry.date).filter(Boolean).sort();

  const notes = [];
  if (linkStates.verified === dataset.entries.length) notes.push('All lesson links resolved');
  if (linkStates['needs-verification'] > 0) {
    const count = linkStates['needs-verification'];
    const verb = count === 1 ? 'needs' : 'need';
    notes.push(`${count} lesson link${count === 1 ? '' : 's'} ${verb} verification`);
  }
  if (linkStates.missing > 0) {
    const count = linkStates.missing;
    notes.push(`${count} lesson${count === 1 ? '' : 's'} without a live-lesson link`);
  }

  const summary = {
    lessons: dataset.entries.length,
    courses: courseOptions(dataset).length,
    firstDate: dates[0] ?? null,
    lastDate: dates.at(-1) ?? null,
    period: formatPeriod(dates[0] ?? null, dates.at(-1) ?? null),
    linkStates,
    linkNotes: notes,
  };
  summaryCache.set(dataset.entries, summary);
  return summary;
}

/** Live selection preview (matched lessons + unmatched picks) for the current state. */
export function previewSelection(dataset, selected) {
  if (!dataset?.entries) return null;
  let cached = selectionCache.get(dataset.entries);
  const key = selected.join('|');
  if (cached?.key === key) return cached.result;
  const result = selectCourses(dataset.entries, selected);
  cached = { key, result };
  selectionCache.set(dataset.entries, cached);
  return result;
}

/** Progress steps with a status the nav can render. */
export function stepsFor(state) {
  const order = STEPS.map((step) => step.id);
  const complete = state.step === 'complete';
  const current = complete ? -1 : order.indexOf(state.step);

  return STEPS.map((step, index) => {
    const status = complete || index < current ? 'done' : index === current ? 'current' : 'todo';
    const visitable =
      step.id === 'upload'
        ? state.status !== 'parsing'
        : step.id === 'period'
          ? Boolean(state.dataset)
          : step.id === 'courses'
            ? Boolean(state.periodDataset)
            : step.id === 'design'
              ? Boolean(state.periodDataset) && state.selected.length > 0
              : Boolean(state.timetable);
    return { ...step, status, visitable, current: index === current };
  });
}

/** Period choices derived from the complete uploaded dataset (months + "all"). */
export function periodChoices(dataset) {
  if (!dataset?.entries) return [];
  const cached = periodCache.get(dataset.entries);
  if (cached) return cached;
  const all = allPeriod(dataset.entries);
  const choices = all ? [...periodOptions(dataset.entries), all] : periodOptions(dataset.entries);
  periodCache.set(dataset.entries, choices);
  return choices;
}

/** Numbers for the SELECTED period — always computed from the projection. */
export function periodSummary(state) {
  if (!state.period || !state.periodDataset) return null;
  const summary = summarizeDataset(state.periodDataset);
  if (!summary) return null;
  return { ...summary, id: state.period.id, type: state.period.type, label: state.period.label };
}

/**
 * True when the selected period reaches past the month the workbook itself is
 * for — i.e. it leans on lesson dates a later timetable release may update.
 * Derived from workbook metadata only: no clock, no filename, no assumptions.
 */
export function isFuturePeriod(state) {
  if (!state.period || !state.dataset) return false;
  return isProvisionalPeriod(state.period, sourceMonthFromDataset(state.dataset));
}

/** Download filename for the calendar file. */
export function calendarFilename(state, today = new Date().toISOString().slice(0, 10)) {
  const slug = (state.student ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug ? `timetableflow-${slug}-${today}.ics` : `timetableflow-${today}.ics`;
}

/** Headline numbers for the completion state — all derived, none invented. */
export function completionStats(state) {
  const summary = state.timetable?.summary;
  if (!summary) return null;
  return {
    classes: summary.lessons,
    courses: summary.courses,
    period: formatPeriod(summary.firstDate, summary.lastDate),
    linkStates: { ...summary.linkStates },
    conflicts: summary.conflictPairs,
  };
}

/** Flattened lesson rows (day-ordered) with a Google Calendar link each. */
export function googleLessonLinks(state) {
  if (!state.timetable) return [];
  const options = { student: state.student?.trim() || null };
  const rows = [];
  for (const day of state.timetable.days) {
    for (const entry of day.entries) {
      const link = googleLessonLink(entry, options);
      if (link) rows.push({ ...link, dayLabel: day.day ?? entry.day, date: day.date ?? entry.date });
    }
  }
  return rows;
}
