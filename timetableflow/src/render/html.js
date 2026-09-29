/**
 * HTML template renderer.
 *
 * Input: the view model (src/render/viewModel.js) and nothing else — this module
 * never sees a workbook, a worksheet or a cell. Every value is HTML-escaped.
 */

import { linkReasonText } from './linkReason.js';

/** Short month labels used by every formatter (shared with the UI layer). */
export const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Full month names used for period labels (shared with the UI layer). */
export const MONTH_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 'Monday, 14 Sep 2026' (or just the date / day name when partial). */
export function formatDate(isoDate, dayName) {
  if (!isoDate) return dayName ?? 'Unscheduled';
  const [, month, day] = isoDate.split('-').map(Number);
  const label = `${day} ${MONTHS[month - 1] ?? ''} ${isoDate.slice(0, 4)}`;
  return dayName ? `${dayName}, ${label}` : label;
}

function renderLink(link) {
  if (link.state === 'verified') {
    return `<a class="link link-ok" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">Join lesson</a>`;
  }
  if (link.state === 'needs-verification') {
    const reason = linkReasonText(link);
    const reasonLine = reason ? `<span class="link-reason">${escapeHtml(reason)}</span>` : '';
    return `<span class="link link-pending">Lesson link needs verification</span>${reasonLine}`;
  }
  return '<span class="link link-none">No link yet</span>';
}

function renderEntry(entry) {
  const badges = [];
  if (entry.recovered) badges.push('<span class="badge">recovered</span>');
  if (entry.titleMismatch) badges.push('<span class="badge badge-warn">title differs</span>');
  return [
    '<tr>',
    `  <td class="time">${escapeHtml(entry.timeLabel ?? '—')}</td>`,
    `  <td class="course"><span class="code">${escapeHtml(entry.courseCode)}</span>`,
    `      <span class="title">${escapeHtml(entry.courseTitle)}</span>${badges.join('')}</td>`,
    `  <td class="action">${renderLink(entry.link)}</td>`,
    '</tr>',
  ].join('\n');
}

function renderDay(day) {
  return [
    `<section class="day">`,
    `  <h2>${escapeHtml(formatDate(day.date, day.day))}</h2>`,
    '  <table>',
    '    <thead><tr><th>Time</th><th>Course</th><th>Live lesson</th></tr></thead>',
    '    <tbody>',
    ...day.entries.map(renderEntry),
    '    </tbody>',
    '  </table>',
    '</section>',
  ].join('\n');
}

function renderConflicts(conflicts) {
  if (!conflicts.length) return '';
  const items = conflicts
    .map((conflict) => {
      const courses = conflict.entries
        .map((entry) => `${escapeHtml(entry.courseCode)} (${escapeHtml(entry.startTime)}–${escapeHtml(entry.endTime)})`)
        .join(' vs ');
      return `<li>${escapeHtml(formatDate(conflict.date, conflict.day))}: ${courses}</li>`;
    })
    .join('\n');
  return [
    '<section class="conflicts">',
    '  <h2>Schedule conflicts</h2>',
    `  <ul>${items}</ul>`,
    '</section>',
  ].join('\n');
}

function renderNotes(notes) {
  if (!notes.length) return '';
  const items = notes.map((note) => `<li class="note note-${escapeHtml(note.kind)}">${escapeHtml(note.text)}</li>`).join('\n');
  return `<section class="notes"><h2>Notes</h2><ul>${items}</ul></section>`;
}

const STYLES = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; padding: 2rem 1.25rem; font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #16202b; background: #f6f8fa; }
main { max-width: 60rem; margin: 0 auto; }
header.page h1 { margin: 0 0 .25rem; font-size: 1.6rem; }
header.page .meta { color: #5b6672; font-size: .9rem; }
.stats { display: flex; flex-wrap: wrap; gap: .75rem; margin: 1rem 0 1.5rem; padding: 0; list-style: none; }
.stats li { background: #fff; border: 1px solid #dbe1e8; border-radius: .5rem; padding: .5rem .75rem; font-size: .9rem; }
.notes ul { margin: .25rem 0 1.5rem; padding-left: 1.25rem; }
.note { margin: .25rem 0; }
.day { background: #fff; border: 1px solid #dbe1e8; border-radius: .75rem; margin-bottom: 1.25rem; overflow: hidden; }
.day h2 { margin: 0; padding: .75rem 1rem; font-size: 1.05rem; background: #eef2f6; border-bottom: 1px solid #dbe1e8; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: .6rem 1rem; border-bottom: 1px solid #eef1f5; vertical-align: top; }
th { font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; color: #5b6672; }
tr:last-child td { border-bottom: 0; }
td.time { white-space: nowrap; font-variant-numeric: tabular-nums; width: 9rem; }
.code { font-weight: 600; margin-right: .5rem; }
.title { color: #33404d; }
.badge { display: inline-block; margin-left: .5rem; padding: .05rem .4rem; border-radius: .35rem; font-size: .72rem; background: #e7edf3; color: #46525f; }
.badge-warn { background: #fdf1d8; color: #7a5a12; }
.link { display: inline-block; padding: .25rem .6rem; border-radius: .4rem; font-size: .88rem; text-decoration: none; }
.link-ok { background: #136f3c; color: #fff; }
.link-pending { background: #fdf1d8; color: #7a5a12; border: 1px solid #e6c66a; }
.link-reason { display: block; margin-top: .3rem; font-size: .8rem; color: #5b6672; }
.link-none { background: #eef1f5; color: #5b6672; }
.conflicts { background: #fff4f4; border: 1px solid #f0b9b9; border-radius: .75rem; padding: .5rem 1rem 1rem; margin-bottom: 1.25rem; }
footer { color: #5b6672; font-size: .82rem; margin-top: 1.5rem; }
`;

/**
 * @param {object} viewModel  output of buildViewModel()
 * @param {{footer?: string}} [options]
 * @returns {string} a complete standalone HTML document
 */
export function renderHtml(viewModel, options = {}) {
  const stats = [
    `${viewModel.summary.lessons} lessons`,
    `${viewModel.summary.courses} courses`,
    `${viewModel.summary.days} days`,
    `${viewModel.summary.linkStates.verified} links ready`,
    `${viewModel.summary.linkStates['needs-verification']} to verify`,
    `${viewModel.summary.linkStates.missing} without link`,
  ];

  const studentLine = viewModel.student ? `for ${escapeHtml(viewModel.student)}` : '';
  const range = viewModel.summary.firstDate
    ? `${viewModel.summary.firstDate} → ${viewModel.summary.lastDate}`
    : 'no dates';

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${escapeHtml(viewModel.title)}</title>`,
    `  <style>${STYLES}</style>`,
    '</head>',
    '<body>',
    '<main>',
    '  <header class="page">',
    `    <h1>${escapeHtml(viewModel.title)} ${studentLine}</h1>`,
    `    <div class="meta">${escapeHtml(range)} · generated ${escapeHtml(viewModel.generatedAt ?? '')}</div>`,
    '  </header>',
    `  <ul class="stats">${stats.map((stat) => `<li>${escapeHtml(stat)}</li>`).join('')}</ul>`,
    renderNotes(viewModel.notes ?? []),
    renderConflicts(viewModel.conflicts ?? []),
    ...viewModel.days.map(renderDay),
    `  <footer>${escapeHtml(options.footer ?? 'Generated by TimetableFlow')}</footer>`,
    '</main>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
