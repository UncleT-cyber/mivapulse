/**
 * Screens — pure functions from state to HTML strings.
 *
 * Every value shown here is derived from the state (which is derived from the
 * normalized dataset). Nothing is hard-coded: no lesson counts, no dates, no
 * course names, no link availability. Presentation only — no Excel, no
 * filesystem, no business rules beyond what selectors already derive.
 */

import { escapeHtml, formatDate } from '../render/html.js';
import { PARSE_STAGES } from '../app/messages.js';
import { renderTimetable, TEMPLATES, getTemplate } from './templates.js';
import { formatPeriod, LINK_COPY } from './timetableBody.js';
import { datasetBounds } from '../student/period.js';
import {
  CATALOG_LIMIT,
  completionStats,
  courseOptions,
  googleLessonLinks,
  isFuturePeriod,
  periodChoices,
  periodSummary,
  previewSelection,
  searchCourses,
  stepsFor,
  summarizeDataset,
} from './selectors.js';
import { NOTICE_COPY, REMINDER_CHOICES } from './state.js';

const esc = escapeHtml;

function actionButton(action, label, options = {}) {
  const { className = 'tf-btn', step, code, id, primary = false, disabled = false } = options;
  const cls = primary ? `${className} tf-btn--primary` : className;
  const attrs = [
    `type="button"`,
    `class="${cls}"`,
    `data-action="${esc(action)}"`,
    step ? `data-step="${esc(step)}"` : '',
    code ? `data-code="${esc(code)}"` : '',
    id ? `data-id="${esc(id)}"` : '',
    disabled ? 'disabled' : '',
  ].filter(Boolean).join(' ');
  return `<button ${attrs}>${esc(label)}</button>`;
}

function stat(label, value) {
  return `<li class="tf-stat"><span class="tf-stat-value">${esc(value)}</span><span class="tf-stat-label">${esc(label)}</span></li>`;
}

function linkStateStats(linkStates) {
  const items = [];
  if (linkStates.verified) items.push(stat('links ready', linkStates.verified));
  if (linkStates['needs-verification']) items.push(stat('need verification', linkStates['needs-verification']));
  if (linkStates.missing) items.push(stat('without a link', linkStates.missing));
  return items.join('');
}

export function renderSteps(state) {
  const steps = stepsFor(state);
  const items = steps
    .map((step, index) => {
      const number = `<span class="tf-step-num" aria-hidden="true">${index + 1}</span>`;
      if (step.current) {
        return `<li class="tf-step tf-step--current" aria-current="step"><span class="tf-step-label">${number}${esc(step.label)}</span></li>`;
      }
      if (step.status === 'done' && step.visitable) {
        return `<li class="tf-step tf-step--done"><button type="button" class="tf-step-label" data-action="step/goto" data-step="${esc(step.id)}"><span class="tf-step-check" aria-hidden="true">✓</span>${esc(step.label)}<span class="tf-sr"> — completed, go back</span></button></li>`;
      }
      return `<li class="tf-step tf-step--todo"><span class="tf-step-label" aria-disabled="true">${number}${esc(step.label)}</span></li>`;
    })
    .join('');
  return `<nav class="tf-steps" aria-label="Progress"><ol>${items}</ol></nav>`;
}

export function renderNotice(state) {
  if (!state.notice) return '';
  const { kind, text } = state.notice;
  const role = kind === 'error' ? 'alert' : 'status';
  return [
    `<div class="tf-notice tf-notice--${esc(kind)}" role="${role}">`,
    `  <p>${esc(text)}</p>`,
    '  ' + actionButton('notice/clear', 'Dismiss', { className: 'tf-notice-close' }),
    '</div>',
  ].join('\n');
}

function renderUpload(state) {
  if (state.status === 'parsing') {
    const currentId = state.stage?.id;
    const currentIndex = PARSE_STAGES.findIndex((stage) => stage.id === currentId);
    const stages = PARSE_STAGES.map((stage, index) => {
      const status = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo';
      return `<li class="tf-stage tf-stage--${status}"${status === 'current' ? ' aria-current="step"' : ''}>${status === 'done' ? '<span aria-hidden="true">✓</span> ' : ''}${esc(stage.label)}</li>`;
    }).join('');
    return [
      '<section class="tf-screen tf-screen--upload" aria-labelledby="tf-upload-heading">',
      '  <div class="tf-panel tf-panel--loading">',
      `    <h1 id="tf-upload-heading">Processing your timetable</h1>`,
      `    <p class="tf-file">${esc(state.filename ?? 'Timetable file')}</p>`,
      `    <ol class="tf-stages" aria-live="polite">${stages}</ol>`,
      '  </div>',
      '</section>',
    ].join('\n');
  }

  if (state.status === 'loaded' && state.dataset) {
    const summary = summarizeDataset(state.dataset);
    const facts = [
      `<li><strong>${summary.lessons}</strong> lessons</li>`,
      `<li><strong>${summary.courses}</strong> courses</li>`,
      `<li>${esc(summary.period)}</li>`,
      ...summary.linkNotes.map((note) => `<li>${esc(note)}</li>`),
    ].join('');
    return [
      '<section class="tf-screen tf-screen--upload" aria-labelledby="tf-upload-heading">',
      '  <div class="tf-panel tf-panel--success">',
      '    <p class="tf-eyebrow" role="status">Timetable loaded</p>',
      `    <h1 id="tf-upload-heading">Your timetable is ready to use</h1>`,
      `    <p class="tf-file">${esc(state.filename ?? '')}</p>`,
      `    <ul class="tf-facts">${facts}</ul>`,
      '    <div class="tf-actions">',
      '      ' + actionButton('upload/continue', 'Choose your period', { primary: true }),
      '      ' + actionButton('upload/reset', 'Choose another file'),
      '    </div>',
      '  </div>',
      '</section>',
    ].join('\n');
  }

  const error = state.error
    ? `<p class="tf-error" role="alert">${esc(state.error.message)}</p>`
    : '';
  const drop = [
    '<div class="tf-drop" data-drop>',
    '  <p class="tf-drop-title">Drop your .xlsx here</p>',
    '  <p class="tf-drop-or">or</p>',
    '  <input type="file" id="tf-file" class="tf-file-input" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-action="file">',
    '  <label for="tf-file" class="tf-btn tf-btn--primary">Choose file</label>',
    '  <p class="tf-drop-hint">Master timetable, .xlsx only. It is read in your browser — nothing is uploaded anywhere.</p>',
    '</div>',
  ].join('\n');

  return [
    '<section class="tf-screen tf-screen--upload" aria-labelledby="tf-upload-heading">',
    '  <div class="tf-hero">',
    `    <h1 id="tf-upload-heading">Build your MIVA timetable</h1>`,
    '    <p class="tf-lead">Upload the master timetable and select the courses you\'re taking. TimetableFlow extracts your classes, lesson times and available live-lesson links into a timetable made for you.</p>',
    error,
    drop,
    '  </div>',
    '</section>',
  ].join('\n');
}

/**
 * Provisional-data notice (informational only). Shown when the chosen period
 * reaches past the month the uploaded workbook itself is for — those lesson
 * dates exist in the file but a later MIVA release may move them. The wording
 * is static product copy; the condition is derived from workbook metadata.
 */
function renderFutureNotice(state) {
  if (!isFuturePeriod(state)) return '';
  return [
    '<aside class="tf-future" data-future-notice aria-label="Future timetable information">',
    '  <h2 class="tf-future-title">Future timetable information</h2>',
    '  <p>This period is included in the uploaded MIVA timetable, but future lesson dates may be updated in a later timetable release. Check the latest MIVA timetable when it becomes available.</p>',
    '</aside>',
  ].join('\n');
}

/** Which period the student is currently working with, stated on screen. */
function periodLine(state, lead) {
  if (!state.period) return '';
  const lessons = state.periodDataset?.entries?.length ?? 0;
  return `  <p class="tf-hint" data-period-context>${esc(lead)} <strong>${esc(state.period.label)}</strong> — ${lessons} lesson${lessons === 1 ? '' : 's'} in this period.</p>`;
}

/** Period selection: choose which slice of the parsed workbook becomes the timetable. */
function renderPeriod(state) {
  if (!state.dataset) {
    return [
      '<section class="tf-screen tf-screen--period" aria-labelledby="tf-period-heading">',
      '  <h1 id="tf-period-heading">Choose your period</h1>',
      `  <p class="tf-empty">${esc(NOTICE_COPY['no-dataset'])}</p>`,
      '  <div class="tf-actions">' + actionButton('step/goto', 'Back to upload', { step: 'upload' }) + '</div>',
      '</section>',
    ].join('\n');
  }

  const bounds = datasetBounds(state.dataset.entries);
  const choices = periodChoices(state.dataset);
  const selectedId = state.period?.id ?? null;
  const summary = periodSummary(state);

  const options = choices
    .map((choice) => {
      const active = choice.id === selectedId;
      return [
        '<li>',
        `  <button type="button" class="tf-period${active ? ' is-selected' : ''}" data-action="period/select" data-id="${esc(choice.id)}" aria-pressed="${active}">`,
        `    <span class="tf-period-label">${esc(choice.label)}</span>`,
        `    <span class="tf-period-meta">${choice.lessons} lesson${choice.lessons === 1 ? '' : 's'} · ${choice.courses} course${choice.courses === 1 ? '' : 's'}</span>`,
        '  </button>',
        '</li>',
      ].join('\n');
    })
    .join('');

  const rangeHint = bounds
    ? `Lessons run from ${formatDate(bounds.firstDate)} to ${formatDate(bounds.lastDate)} — any dates you enter must fall inside that.`
    : '';
  const range = [
    '  <fieldset class="tf-range">',
    '    <legend class="tf-range-legend">Custom date range</legend>',
    '    <div class="tf-range-fields">',
    '      <span class="tf-range-field">',
    '        <label for="tf-period-from">From</label>',
    `        <input type="date" id="tf-period-from" class="tf-input" data-action="period/from" value="${esc(state.periodDraft.from)}"${bounds ? ` min="${esc(bounds.firstDate)}" max="${esc(bounds.lastDate)}"` : ''}>`,
    '      </span>',
    '      <span class="tf-range-field">',
    '        <label for="tf-period-to">To</label>',
    `        <input type="date" id="tf-period-to" class="tf-input" data-action="period/to" value="${esc(state.periodDraft.to)}"${bounds ? ` min="${esc(bounds.firstDate)}" max="${esc(bounds.lastDate)}"` : ''}>`,
    '      </span>',
    '      ' + actionButton('period/range/apply', 'Use these dates'),
    '    </div>',
    rangeHint ? `    <p class="tf-hint">${esc(rangeHint)}</p>` : '',
    '  </fieldset>',
  ].join('\n');

  const chosen = summary
    ? [
        '<div class="tf-period-summary" aria-live="polite">',
        `  <h2>${esc(summary.label)}</h2>`,
        `  <p class="tf-count">${summary.lessons} lesson${summary.lessons === 1 ? '' : 's'} · ${summary.courses} course${summary.courses === 1 ? '' : 's'}</p>`,
        ...summary.linkNotes.map((note) => `<p class="tf-hint">${esc(note)}</p>`),
        '</div>',
      ].join('\n')
    : '<p class="tf-empty">No period selected yet — pick one to continue.</p>';

  return [
    '<section class="tf-screen tf-screen--period" aria-labelledby="tf-period-heading">',
    '  <h1 id="tf-period-heading">Choose your period</h1>',
    bounds
      ? `  <p class="tf-lead">This timetable contains lessons from <strong>${formatDate(bounds.firstDate)}</strong> to <strong>${formatDate(bounds.lastDate)}</strong>. Choose the period you want to use for your timetable.</p>`
      : '  <p class="tf-lead">Choose the period you want to use for your timetable.</p>',
    renderFutureNotice(state),
    `  <div class="tf-periods"><ul class="tf-period-list">${options}</ul></div>`,
    range,
    chosen,
    '  <div class="tf-actions tf-actions--bar">',
    '    ' + actionButton('step/goto', 'Back', { step: 'upload' }),
    '    ' + actionButton('period/continue', 'Continue to courses', { primary: true }),
    '  </div>',
    '</section>',
  ].join('\n');
}

function courseTitleFor(catalog, code) {
  const match = catalog.find(
    (course) => course.courseCode === code || course.altCodes.includes(code),
  );
  return match?.titles?.[0] ?? null;
}

function renderSelectedChips(state, catalog) {
  if (!state.selected.length) {
    return '<p class="tf-empty">No courses selected yet — pick them from the list below.</p>';
  }
  const chips = state.selected
    .map((code) => {
      const title = courseTitleFor(catalog, code);
      return [
        '<li>',
        `  <button type="button" class="tf-chip tf-chip--selected" data-action="course/remove" data-code="${esc(code)}" aria-pressed="true">`,
        `    <span class="tf-chip-check" aria-hidden="true">✓</span>`,
        `    <span class="tf-chip-code">${esc(code)}</span>`,
        title ? `    <span class="tf-chip-title">${esc(title)}</span>` : '',
        `    <span class="tf-chip-remove" aria-hidden="true">×</span>`,
        `    <span class="tf-sr">Remove ${esc(code)}</span>`,
        '  </button>',
        '</li>',
      ].filter(Boolean).join('\n');
    })
    .join('');
  return `<ul class="tf-chips">${chips}</ul>`;
}

function renderUnmatched(selection) {
  if (!selection?.unmatched?.length) return '';
  const items = selection.unmatched
    .map(
      (item) =>
        `<li><strong>${esc(item.normalized)}</strong> — Course not found in this timetable</li>`,
    )
    .join('');
  return [
    '<div class="tf-unmatched" role="status">',
    '  <h3>Not in this timetable</h3>',
    `  <ul>${items}</ul>`,
    '  <p>Nothing was removed — these stay selected until you deselect them. They may be on a timetable we could not match.</p>',
    '</div>',
  ].join('\n');
}

function renderCourses(state) {
  const catalog = courseOptions(state.periodDataset);
  const matches = searchCourses(catalog, state.search);
  const shown = matches.slice(0, CATALOG_LIMIT);
  const selection = previewSelection(state.periodDataset, state.selected);

  const cards = shown
    .map((course) => {
      const selected = state.selected.includes(course.courseCode);
      const title = course.titles[0] ?? null;
      return [
        '<li>',
        `  <button type="button" class="tf-course${selected ? ' is-selected' : ''}" data-action="course/toggle" data-code="${esc(course.courseCode)}" aria-pressed="${selected}">`,
        '    <span class="tf-course-head">',
        `      <span class="tf-course-code">${esc(course.courseCode)}</span>`,
        `      <span class="tf-course-lessons">${course.lessons} lesson${course.lessons === 1 ? '' : 's'}</span>`,
        '    </span>',
        title ? `    <span class="tf-course-title">${esc(title)}</span>` : '',
        course.titles.length > 1
          ? `    <span class="tf-course-alt">${esc(course.titles.slice(1).join(' · '))}</span>`
          : '',
        '  </button>',
        '</li>',
      ].filter(Boolean).join('\n');
    })
    .join('');

  const emptyList = matches.length
    ? ''
    : `<p class="tf-empty">No courses match “${esc(state.search)}”.</p>`;

  const overflow =
    matches.length > CATALOG_LIMIT
      ? `<p class="tf-overflow">Showing ${CATALOG_LIMIT} of ${matches.length} courses — refine your search to narrow it down.</p>`
      : '';

  const count = state.selected.length;
  const countLabel = `${count} course${count === 1 ? '' : 's'} selected`;
  const matchedLabel = selection
    ? `${selection.stats.lessons} lesson${selection.stats.lessons === 1 ? '' : 's'} matched`
    : '';

  return [
    '<section class="tf-screen tf-screen--courses" aria-labelledby="tf-courses-heading">',
    `  <h1 id="tf-courses-heading">Select your courses</h1>`,
    '  <p class="tf-lead">Search for your course code or name, then pick the ones you are taking.</p>',
    periodLine(state, 'Course list for'),
    renderFutureNotice(state),
    '  <div class="tf-selected">',
    '    <h2>Selected courses</h2>',
    `    <p class="tf-count" aria-live="polite">${esc(countLabel)}${matchedLabel ? ` · ${esc(matchedLabel)}` : ''}</p>`,
    renderSelectedChips(state, catalog),
    '  </div>',
    renderUnmatched(selection),
    '  <div class="tf-search">',
    '    <label for="tf-search">Search courses</label>',
    `    <input type="search" id="tf-search" class="tf-input" placeholder="Search course code or name…" value="${esc(state.search)}" data-action="search" autocomplete="off">`,
    `    <p class="tf-result-count">${matches.length} course${matches.length === 1 ? '' : 's'} found</p>`,
    '  </div>',
    `  <ul class="tf-course-list">${cards}</ul>`,
    emptyList,
    overflow,
    '  <div class="tf-actions tf-actions--bar">',
    '    ' + actionButton('step/goto', 'Back', { step: 'period' }),
    '    ' + actionButton('courses/continue', 'Continue to design', { primary: true }),
    '  </div>',
    '</section>',
  ].join('\n');
}

function renderDesign(state) {
  if (!state.timetable) {
    return [
      '<section class="tf-screen" aria-labelledby="tf-design-heading">',
      `  <h1 id="tf-design-heading">Choose a template</h1>`,
      `  <p class="tf-empty">Select your courses first, then come back to pick a template.</p>`,
      '  <div class="tf-actions">' + actionButton('step/goto', 'Back to courses', { step: 'courses' }) + '</div>',
      '</section>',
    ].join('\n');
  }

  const viewModel = state.viewModel;
  const limit = 4;
  const cards = TEMPLATES.map((template) => {
    const selected = state.template === template.id;
    return [
      `<article class="tf-template${selected ? ' is-selected' : ''}">`,
      `  <button type="button" class="tf-template-btn" data-action="template/select" data-id="${esc(template.id)}" aria-pressed="${selected}">`,
      `    <span class="tf-template-name">${esc(template.name)}</span>`,
      `    <span class="tf-template-desc">${esc(template.description)}</span>`,
      `    <span class="tf-template-state">${selected ? 'Selected' : 'Use this template'}</span>`,
      '  </button>',
      `  <div class="tf-template-preview" aria-hidden="true">${renderTimetable(viewModel, template.id, { limit, preview: true, showConflicts: false, showNotes: false })}</div>`,
      '</article>',
    ].join('\n');
  }).join('');

  const total = viewModel.summary.lessons;
  const visible = Math.min(limit, total);

  return [
    '<section class="tf-screen tf-screen--design" aria-labelledby="tf-design-heading">',
    `  <h1 id="tf-design-heading">Choose a template</h1>`,
    '  <p class="tf-lead">Same timetable, six looks. Each preview uses your own lessons — switch and compare.</p>',
    periodLine(state, 'Your timetable covers'),
    `  <p class="tf-preview-note">Previewing ${visible} of your ${total} lesson${total === 1 ? '' : 's'} · ${esc(getTemplate(state.template).name)} selected</p>`,
    `  <div class="tf-templates">${cards}</div>`,
    '  <div class="tf-actions tf-actions--bar">',
    '    ' + actionButton('step/goto', 'Back to courses', { step: 'courses' }),
    '    ' + actionButton('step/goto', 'Continue to preview', { step: 'preview', primary: true }),
    '  </div>',
    '</section>',
  ].join('\n');
}

function renderPreview(state) {
  if (!state.timetable || !state.viewModel) {
    return [
      '<section class="tf-screen" aria-labelledby="tf-preview-heading">',
      `  <h1 id="tf-preview-heading">Your timetable</h1>`,
      '  <p class="tf-empty">Nothing to preview yet — select your courses first.</p>',
      '  <div class="tf-actions">' + actionButton('step/goto', 'Back to courses', { step: 'courses' }) + '</div>',
      '</section>',
    ].join('\n');
  }

  const viewModel = state.viewModel;
  const selection = previewSelection(state.periodDataset, state.selected);
  const summary = viewModel.summary;
  const stats = [
    stat('lessons', summary.lessons),
    stat('courses', summary.courses),
    stat('days', summary.days),
    linkStateStats(summary.linkStates),
  ].join('');
  const conflictStat = summary.conflictPairs
    ? stat('schedule conflicts', summary.conflictPairs)
    : '';

  return [
    '<section class="tf-screen tf-screen--preview" aria-labelledby="tf-preview-heading">',
    `  <h1 id="tf-preview-heading">Your timetable</h1>`,
    '  <p class="tf-lead">Review your lessons, conflicts and links — then confirm.</p>',
    periodLine(state, 'Timetable for'),
    renderFutureNotice(state),
    `  <ul class="tf-stats">${stats}${conflictStat}</ul>`,
    renderUnmatched(selection),
    `  <div class="tf-field">`,
    `    <label for="tf-student">Your name <span class="tf-field-hint">(optional — appears in the calendar file)</span></label>`,
    `    <input type="text" id="tf-student" class="tf-input" value="${esc(state.student)}" data-action="student" autocomplete="name">`,
    `  </div>`,
    `  <div class="tf-timetable" data-template-root>${renderTimetable(viewModel, state.template)}</div>`,
    '  <div class="tf-actions tf-actions--bar">',
    '    ' + actionButton('step/goto', 'Back to design', { step: 'design' }),
    '    ' + actionButton('preview/confirm', 'Confirm timetable', { primary: true }),
    '  </div>',
    '</section>',
  ].join('\n');
}

/** Reminder choice (native radios) — the alarm minutes baked into the .ics file. */
function renderReminderField(state) {
  const options = REMINDER_CHOICES.map((minutes) => {
    const checked = minutes === state.reminderMinutes ? ' checked' : '';
    const label = minutes === 0 ? 'Off' : `${minutes} min`;
    return `      <label class="tf-seg" for="tf-rem-${minutes}"><input type="radio" id="tf-rem-${minutes}" name="tf-reminder" value="${minutes}" data-action="calendar/reminder/set" data-minutes="${minutes}"${checked}><span>${label}</span></label>`;
  }).join('\n');

  return [
    '  <fieldset class="tf-segment">',
    '    <legend class="tf-segment-legend">Remind me before each lesson</legend>',
    '    <div class="tf-seg-track">',
    options,
    '    </div>',
    '  </fieldset>',
    state.reminderMinutes > 0
      ? `  <p class="tf-hint">Each lesson gets a reminder ${state.reminderMinutes} minutes before it starts.</p>`
      : '  <p class="tf-hint">Reminders are off — the calendar file will not alert you.</p>',
  ].join('\n');
}

/** Per-lesson Google Calendar links (works on phones without downloading a file). */
function renderGoogleLessonLinks(state) {
  const rows = googleLessonLinks(state);
  if (!rows.length) return '';

  const items = rows
    .map((row) => {
      const when = formatDate(row.date, row.dayLabel);
      const accessible = `Add ${row.courseCode}, ${when}, ${row.startTime} to ${row.endTime}, to Google Calendar`;
      return [
        '      <li class="tf-gcal-row">',
        `        <span class="tf-gcal-when"><strong>${esc(row.courseCode)}</strong> · ${esc(when)} · ${esc(row.startTime)}–${esc(row.endTime)}</span>`,
        `        <a class="tf-gcal-link" href="${esc(row.href)}" target="_blank" rel="noopener noreferrer">Add to Google Calendar<span class="tf-sr"> — ${esc(accessible)}</span></a>`,
        '      </li>',
      ].join('\n');
    })
    .join('\n');

  return [
    '  <div class="tf-gcal">',
    '    <h2 class="tf-h2">Or add your lessons one by one</h2>',
    '    <p class="tf-hint">Opens Google Calendar in a new tab — no file needed on a phone.</p>',
    '    <ul class="tf-gcal-list">',
    items,
    '    </ul>',
    '  </div>',
  ].join('\n');
}

function renderCalendar(state) {
  const stats = completionStats(state);
  if (!stats) {
    return [
      '<section class="tf-screen" aria-labelledby="tf-calendar-heading">',
      `  <h1 id="tf-calendar-heading">Your timetable is ready.</h1>`,
      '  <p class="tf-empty">Generate your timetable first.</p>',
      '  <div class="tf-actions">' + actionButton('step/goto', 'Back to courses', { step: 'courses' }) + '</div>',
      '</section>',
    ].join('\n');
  }

  const retry = state.calendar.status === 'error';
  const statList = [
    stat('classes', stats.classes),
    stat('courses', stats.courses),
    `<li class="tf-stat"><span class="tf-stat-value">${esc(stats.period)}</span><span class="tf-stat-label">period</span></li>`,
    linkStateStats(stats.linkStates),
  ].join('');

  return [
    '<section class="tf-screen tf-screen--calendar" aria-labelledby="tf-calendar-heading">',
    `  <h1 id="tf-calendar-heading">Your timetable is ready.</h1>`,
    '  <p class="tf-lead">Add your classes to your calendar?</p>',
    `  <ul class="tf-stats">${statList}</ul>`,
    renderReminderField(state),
    renderGoogleLessonLinks(state),
    '  <p class="tf-hint">The .ics file works with Google Calendar, Apple Calendar, Outlook and other apps that support .ics files.</p>',
    '  <div class="tf-actions tf-actions--bar">',
    '    ' + actionButton('step/goto', 'Back to timetable', { step: 'preview' }),
    '    ' + actionButton('calendar/download', retry ? 'Try export again' : 'Download calendar', { primary: true }),
    '  </div>',
    '</section>',
  ].join('\n');
}

function renderComplete(state) {
  const stats = completionStats(state);
  if (!stats) return renderCalendar(state);

  const statList = [
    stat('classes', stats.classes),
    stat('courses', stats.courses),
    `<li class="tf-stat"><span class="tf-stat-value">${esc(stats.period)}</span><span class="tf-stat-label">period</span></li>`,
    linkStateStats(stats.linkStates),
  ].join('');
  const conflictsNote = stats.conflicts
    ? `<p class="tf-hint">${stats.conflicts} schedule conflict${stats.conflicts === 1 ? '' : 's'} in this timetable — open it below to review.</p>`
    : '';

  return [
    '<section class="tf-screen tf-screen--complete" aria-labelledby="tf-complete-heading">',
    `  <h1 id="tf-complete-heading">Your timetable is ready.</h1>`,
    `  <p class="tf-lead" role="status">Calendar file downloaded — your classes are ready to import.</p>`,
    `  <ul class="tf-stats">${statList}</ul>`,
    conflictsNote,
    renderGoogleLessonLinks(state),
    '  <p class="tf-hint">Import it into Google Calendar, Apple Calendar, Outlook or another calendar app that supports .ics files.</p>',
    '  <div class="tf-actions tf-actions--bar">',
    '    ' + actionButton('step/goto', 'View timetable', { step: 'preview' }),
    '    ' + actionButton('calendar/download', 'Download calendar again', { primary: true }),
    '  </div>',
    '</section>',
  ].join('\n');
}

function renderScreen(state) {
  switch (state.step) {
    case 'period':
      return renderPeriod(state);
    case 'courses':
      return renderCourses(state);
    case 'design':
      return renderDesign(state);
    case 'preview':
      return renderPreview(state);
    case 'calendar':
      return renderCalendar(state);
    case 'complete':
      return renderComplete(state);
    case 'upload':
    default:
      return renderUpload(state);
  }
}

/** Whole application content for the current state. */
export function renderApp(state) {
  return [renderSteps(state), renderNotice(state), renderScreen(state)].filter(Boolean).join('\n');
}
