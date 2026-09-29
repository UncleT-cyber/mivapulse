/**
 * Shared timetable markup.
 *
 * One data path for every visual template: this module renders the VIEW MODEL
 * (never a workbook, never an entry's Excel provenance) into semantic HTML.
 * Visual differences between templates are applied by CSS on `data-template`
 * plus an optional per-course colour hook — template logic never re-derives
 * lessons, days, conflicts or link states.
 */

import { escapeHtml, formatDate, MONTHS, MONTH_FULL } from '../render/html.js';
import { linkReasonText } from '../render/linkReason.js';
import { buildWeeks } from './grid.js';

export const LINK_COPY = {
  verified: 'Join live lesson',
  'needs-verification': 'Lesson link needs verification',
  missing: 'Live lesson link unavailable',
};

/** '14 Sep 2026 – 16 Sep 2026', 'September 2026', 'Nov 2024 – Nov 2026', 'Dates unavailable'. */
export function formatPeriod(firstDate, lastDate) {
  if (!firstDate || !lastDate) return 'Dates unavailable';
  const [fy, fm] = firstDate.split('-');
  const [ly, lm] = lastDate.split('-');
  const monthName = (index) => MONTHS[Number(index) - 1] ?? '';
  if (fy === ly && fm === lm) {
    return `${MONTH_FULL[Number(fm) - 1]} ${fy}`;
  }
  if (fy === ly) return `${monthName(fm)} – ${monthName(lm)} ${fy}`;
  return `${monthName(fm)} ${fy} – ${monthName(lm)} ${ly}`;
}

const formatDay = formatDate;

/** Deterministic hue from a course code (colour-coded templates only). */
export function courseHue(courseCode) {
  let hash = 0;
  for (const char of String(courseCode ?? '')) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

function timeRange(day, entry) {
  const start = entry.startTime;
  const end = entry.endTime;
  if (!start && !end) return '';
  const toTime = (value) => (day?.date && value
    ? `<time datetime="${escapeHtml(day.date)}T${escapeHtml(value)}">${escapeHtml(value)}</time>`
    : escapeHtml(value ?? ''));
  if (start && end) return `${toTime(start)} – ${toTime(end)}`;
  return toTime(start || end);
}

function renderCandidates(entry) {
  const candidates = entry.link.candidates ?? [];
  if (!candidates.length) return '';
  const items = candidates
    .map((candidate) => {
      const titles = candidate.titles?.length ? `${escapeHtml(candidate.titles.join(', '))} — ` : '';
      return `<li>${titles}<span class="tf-candidate-url">${escapeHtml(candidate.url)}</span></li>`;
    })
    .join('');
  return [
    '<details class="tf-candidates">',
    '  <summary>View link options</summary>',
    `  <ul>${items}</ul>`,
    '  <p class="tf-candidates-note">Nothing was chosen for you — check which link belongs to your class.</p>',
    '</details>',
  ].join('\n');
}

function renderLink(entry) {
  const { link } = entry;
  if (link.state === 'verified') {
    return `<a class="tf-btn tf-btn--join" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(LINK_COPY.verified)}</a>`;
  }
  if (link.state === 'needs-verification') {
    const reason = linkReasonText(link);
    const reasonLine = reason
      ? `<p class="tf-state-reason" data-reason="${escapeHtml(link.reason)}">${escapeHtml(reason)}</p>`
      : '';
    return [
      `<div class="tf-state-group">`,
      `  <p class="tf-state tf-state--verify">${escapeHtml(LINK_COPY['needs-verification'])}</p>`,
      reasonLine,
      `</div>`,
      renderCandidates(entry),
    ].filter(Boolean).join('\n');
  }
  return `<p class="tf-state tf-state--none">${escapeHtml(LINK_COPY.missing)}</p>`;
}

function renderLesson(day, entry, options = {}) {
  const state = entry.link.state;
  const hue = options.coloured ? ` style="--tf-course-hue:${courseHue(entry.courseCode)}"` : '';
  const time = options.showTime === false ? '' : timeRange(day, entry);
  const lines = [
    `<li class="tf-lesson tf-lesson--${escapeHtml(state)}" data-state="${escapeHtml(state)}" data-course="${escapeHtml(entry.courseCode)}"${hue}>`,
  ];
  if (time) lines.push(`  <p class="tf-time">${time}</p>`);
  lines.push(
    '  <div class="tf-lesson-main">',
    `    <p class="tf-course"><span class="tf-code">${escapeHtml(entry.courseCode)}</span><span class="tf-title">${escapeHtml(entry.courseTitle)}</span></p>`,
    '  </div>',
    `  <div class="tf-lesson-actions">${renderLink(entry)}</div>`,
    '</li>',
  );
  return lines.join('\n');
}

function dayHeading(day) {
  return `<h3 class="tf-day-heading"><span class="tf-day-name">${escapeHtml(formatDay(day.date, day.day))}</span><span class="tf-day-count">${day.entries.length} lesson${day.entries.length === 1 ? '' : 's'}</span></h3>`;
}

/** One classic weekly timetable: time rows x day columns, one table per week. */
function renderWeekBlock(week, options) {
  const covered = new Set();

  const header = week.columns
    .map((column) => `<th scope="col" class="tf-week-day">${escapeHtml(formatDay(column.date, column.day))}</th>`)
    .join('');

  const rows = week.rows
    .map((row, rowIndex) => {
      const cells = week.columns
        .map((column, columnIndex) => {
          const key = `${rowIndex}:${columnIndex}`;
          if (covered.has(key)) return '';
          const cell = week.cells.get(key);
          if (!cell) return '<td class="tf-week-cell tf-week-cell--empty"></td>';

          for (let offset = 1; offset < cell.span; offset += 1) covered.add(`${rowIndex + offset}:${columnIndex}`);
          const rowspan = cell.span > 1 ? ` rowspan="${cell.span}"` : '';
          const lessons = cell.entries
            .map((entry) =>
              renderLesson({ date: column.date, day: column.day }, entry, {
                coloured: options.coloured,
                // the row header already says the time; show it in the cell only
                // when it adds information (shared cells / off-band starts)
                showTime: cell.entries.length > 1 || entry.startTime !== row.start,
              }),
            )
            .join('');
          return `<td class="tf-week-cell"${rowspan} data-column="${columnIndex}"><ul class="tf-cell-lessons">${lessons}</ul></td>`;
        })
        .join('');
      return `        <tr><th scope="row" class="tf-week-time">${escapeHtml(row.start)} – ${escapeHtml(row.end)}</th>${cells}</tr>`;
    })
    .join('\n');

  const unplaced = week.unplaced.length
    ? [
        '    <div class="tf-unplaced">',
        '      <h4 class="tf-unplaced-heading">Lessons without a scheduled time</h4>',
        '      <ul class="tf-lessons">',
        ...week.unplaced.map((entry) => renderLesson({ date: null, day: null }, entry, { coloured: options.coloured })),
        '      </ul>',
        '    </div>',
      ].join('\n')
    : '';

  return [
    `    <section class="tf-week-block" data-week="${escapeHtml(week.key)}">`,
    `      <h3 class="tf-week-heading">${escapeHtml(week.label)}</h3>`,
    '      <div class="tf-week-wrap">',
    '        <table class="tf-week">',
    `          <caption class="tf-sr">Timetable for ${escapeHtml(week.label)}</caption>`,
    '          <thead>',
    `            <tr><th scope="col" class="tf-week-corner">Time</th>${header}</tr>`,
    '          </thead>',
    '          <tbody>',
    rows,
    '          </tbody>',
    '        </table>',
    '      </div>',
    unplaced,
    '    </section>',
  ]
    .filter(Boolean)
    .join('\n');
}

function renderGrid(weeks, options) {
  return ['<div class="tf-grid">', ...weeks.map((week) => renderWeekBlock(week, options)), '</div>'].join('\n');
}

function renderTimeline(days, options) {
  return [
    '<ol class="tf-timeline">',
    ...days.map((day) => [
      `<li class="tf-timeline-day" data-date="${escapeHtml(day.date ?? '')}">`,
      dayHeading(day),
      '  <ol class="tf-lessons">',
      ...day.entries.map((entry) => renderLesson(day, entry, options)),
      '  </ol>',
      '</li>',
    ].join('\n')),
    '</ol>',
  ].join('\n');
}

export function renderConflicts(conflicts) {
  if (!conflicts?.length) return '';
  const items = conflicts
    .map((conflict) => {
      const pair = conflict.entries
        .map(
          (entry) =>
            `<p class="tf-conflict-entry"><span class="tf-code">${escapeHtml(entry.courseCode)}</span><span class="tf-conflict-time">${escapeHtml(entry.startTime ?? '')} – ${escapeHtml(entry.endTime ?? '')}</span></p>`,
        )
        .join('');
      const minutes = conflict.overlapMinutes ? `${conflict.overlapMinutes} min overlap` : 'overlap';
      return [
        '  <li class="tf-conflict">',
        `    <p class="tf-conflict-when">${escapeHtml(formatDay(conflict.date, conflict.day))} · ${escapeHtml(minutes)}</p>`,
        `    <div class="tf-conflict-pair">${pair}</div>`,
        '    <p class="tf-conflict-note">These lessons overlap — decide which one you will attend.</p>',
        '  </li>',
      ].join('\n');
    })
    .join('\n');
  const heading = conflicts.length === 1 ? 'Schedule conflict' : 'Schedule conflicts';
  return [
    `<section class="tf-conflicts" aria-labelledby="tf-conflicts-heading">`,
    `  <h2 id="tf-conflicts-heading">${heading}</h2>`,
    `  <ul>${items}\n  </ul>`,
    '</section>',
  ].join('\n');
}

export function renderNotes(notes) {
  if (!notes?.length) return '';
  const items = notes.map((note) => `<li class="tf-note tf-note--${escapeHtml(note.kind)}">${escapeHtml(note.text)}</li>`).join('');
  return `<section class="tf-notes" aria-labelledby="tf-notes-heading"><h2 id="tf-notes-heading">Good to know</h2><ul>${items}</ul></section>`;
}

function applyLimit(days, limit) {
  if (!limit) return days;
  const out = [];
  let remaining = limit;
  for (const day of days) {
    if (remaining <= 0) break;
    const entries = day.entries.slice(0, remaining);
    if (!entries.length) break;
    out.push({ ...day, entries });
    remaining -= entries.length;
  }
  return out;
}

/**
 * @param {object} viewModel  output of buildViewModel()
 * @param {{templateId: string, layout?: 'grid'|'timeline', coloured?: boolean,
 *          limit?: number|null, preview?: boolean, showConflicts?: boolean,
 *          showNotes?: boolean}} options
 */
export function renderTimetableBody(viewModel, options) {
  const {
    templateId,
    layout = 'grid',
    coloured = false,
    limit = null,
    preview = false,
    showConflicts = true,
    showNotes = true,
  } = options;

  const days = viewModel.days ?? [];
  const lessonTotal = days.reduce((total, day) => total + day.entries.length, 0);
  const shownDays = limit ? applyLimit(days, limit) : days;
  const hidden = lessonTotal - shownDays.reduce((total, day) => total + day.entries.length, 0);

  const sections = [];
  if (showConflicts) sections.push(renderConflicts(viewModel.conflicts));
  if (showNotes && !preview) sections.push(renderNotes(viewModel.notes));
  sections.push(
    layout === 'timeline'
      ? renderTimeline(shownDays, { coloured })
      : renderGrid(buildWeeks(days, { limit }), { coloured }),
  );

  const hiddenNote = hidden
    ? `<p class="tf-tt-more">Showing ${lessonTotal - hidden} of ${lessonTotal} lessons — the full timetable shows them all.</p>`
    : '';

  return [
    `<div class="tf-tt tf-tt--${escapeHtml(templateId)}" data-template="${escapeHtml(templateId)}" data-layout="${escapeHtml(layout)}"${preview ? ' data-preview="true"' : ''}>`,
    ...sections,
    hiddenNote,
    '</div>',
  ].filter(Boolean).join('\n');
}
