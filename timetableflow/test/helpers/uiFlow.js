/**
 * Shared UI-flow helpers for tests: drive the pure reducer the same way the
 * browser glue does, without any DOM.
 */

import { initialState, reduce } from '../../src/ui/state.js';

/**
 * upload -> period -> courses, with an explicit period choice.
 *
 * Phase 8.1 inserts a period step between upload and course selection. The app
 * NEVER pre-selects a period, so a test that wants the whole workbook states
 * that choice itself ("all" = every parsed lesson, the Phase 8 behaviour).
 */
export function uploadState(dataset, filename = 'MIVA Master.xlsx') {
  let state = initialState();
  state = reduce(state, { type: 'upload/started', filename });
  state = reduce(state, { type: 'upload/succeeded', dataset });
  return toCourses(state);
}

/** upload -> period screen, before any period has been chosen. */
export function periodScreen(dataset, filename = 'MIVA Master.xlsx') {
  let state = initialState();
  state = reduce(state, { type: 'upload/started', filename });
  state = reduce(state, { type: 'upload/succeeded', dataset });
  return reduce(state, { type: 'upload/continue' });
}

/** Choose a period on the period screen ('all', a 'YYYY-MM' month, or a custom range apply). */
export function choosePeriod(state, id) {
  return reduce(state, { type: 'period/select', id });
}

/** From a loaded upload state: continue -> period screen -> "all dates" -> courses. */
export function toCourses(state) {
  const onPeriod = reduce(state, { type: 'upload/continue' });
  return reduce(choosePeriod(onPeriod, 'all'), { type: 'period/continue' });
}

export function selectCourses(state, codes) {
  let next = state;
  for (const code of codes) next = reduce(next, { type: 'course/toggle', code });
  return next;
}

export function generate(state, generatedAt = '2026-09-01T10:00:00.000Z') {
  return reduce(state, { type: 'courses/continue', generatedAt });
}

/** upload -> courses -> design, with the given courses selected. */
export function designState(dataset, codes) {
  return generate(selectCourses(uploadState(dataset), codes));
}

/** upload -> preview, with the given courses selected. */
export function previewState(dataset, codes) {
  return reduce(designState(dataset, codes), { type: 'step/goto', step: 'preview' });
}

export function calendarState(dataset, codes) {
  return reduce(previewState(dataset, codes), { type: 'preview/confirm' });
}

/** HTML of a single lesson card, cut at the next lesson or the list end. */
export function lessonBlock(html, courseCode) {
  const marker = `data-course="${courseCode}"`;
  const start = html.indexOf(marker);
  if (start < 0) return null;
  const rest = html.slice(start);
  const nextLesson = rest.slice(marker.length).indexOf('data-course="');
  const endOfList = rest.indexOf('</ol>');
  const cuts = [nextLesson >= 0 ? marker.length + nextLesson : -1, endOfList].filter((cut) => cut > 0);
  if (!cuts.length) return rest;
  return rest.slice(0, Math.min(...cuts));
}

/** Visible text of an HTML fragment (for cross-template comparison). */
export function stripTags(html) {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
