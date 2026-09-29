/**
 * UI state machine — pure, synchronous, framework-independent.
 *
 * The reducer owns workflow state only (which step, which dataset, which
 * courses, which template). All heavy lifting stays in the engine modules it
 * delegates to: selectCourses -> buildStudentTimetable -> buildViewModel ->
 * toICalendar. Nothing here reads Excel, a workbook, or the filesystem.
 */

import { selectCourses } from '../student/selection.js';
import {
  customPeriod,
  datasetBounds,
  periodById,
  projectDataset,
  rangeProblem,
  samePeriod,
} from '../student/period.js';
import { buildStudentTimetable } from '../student/timetable.js';
import { buildViewModel } from '../render/viewModel.js';
import { toICalendar, DEFAULT_ALARM_MINUTES } from '../export/ical.js';
import { PARSE_STAGES, parseErrorCopy } from '../app/messages.js';
import { DEFAULT_TEMPLATE_ID, TEMPLATES } from './templates.js';

export const STEPS = [
  { id: 'upload', label: 'Upload' },
  { id: 'period', label: 'Period' },
  { id: 'courses', label: 'Courses' },
  { id: 'design', label: 'Design' },
  { id: 'preview', label: 'Preview' },
  { id: 'calendar', label: 'Calendar' },
];

export const STEP_IDS = STEPS.map((step) => step.id);

export const CALENDAR_NAME = 'My TimetableFlow timetable';

/** Reminder choices offered on the calendar screen (minutes before a lesson; 0 = off). */
export const REMINDER_CHOICES = [10, 15, 30, 0];

export const NOTICE_COPY = {
  'no-courses': 'Select at least one course to continue.',
  'no-match': 'None of the selected courses were found in this timetable.',
  'no-dataset': 'Upload a timetable first.',
  'no-period': 'Choose which period of this timetable you want to use.',
  'empty-period': 'That period has no lessons in this timetable.',
  'range-missing': 'Enter both a start date and an end date.',
  'range-invalid': 'Enter a real start date and end date.',
  'range-order': 'The start date cannot be after the end date.',
  'range-outside': 'Choose dates inside the uploaded timetable.',
  'no-timetable': 'Select your courses and generate your timetable first.',
};

export function initialState(overrides = {}) {
  return {
    step: 'upload',
    status: 'idle', // idle | parsing | loaded | error
    stage: null, // {id, label} while parsing
    error: null, // {kind, message}
    filename: null,
    dataset: null, // the COMPLETE parsed workbook (never filtered)
    period: null, // {id, type, startDate, endDate, label} — the student's choice
    periodDataset: null, // full dataset projected into `period` (what everything downstream uses)
    periodDraft: { from: '', to: '' }, // custom range inputs, raw strings
    search: '',
    selected: [],
    student: '',
    template: DEFAULT_TEMPLATE_ID,
    selection: null,
    timetable: null,
    viewModel: null,
    reminderMinutes: DEFAULT_ALARM_MINUTES,
    calendar: { status: 'idle', error: null, ics: null, events: 0, skipped: 0 },
    notice: null, // {kind: 'error' | 'info', text}
    ...overrides,
  };
}

function withNotice(state, kind, text) {
  return { ...state, notice: { kind, text } };
}

function clearGenerated(state, overrides = {}) {
  return {
    ...state,
    selection: null,
    timetable: null,
    viewModel: null,
    calendar: initialState().calendar,
    notice: null,
    ...overrides,
  };
}

function generate(state, options = {}) {
  const selection = options.selection ?? previewSelectionNow(state);
  if (!selection?.entries.length) return state;

  const timetable = buildStudentTimetable(selection.entries, {
    student: state.student.trim() || null,
    selection: selection.requested.map((item) => item.normalized),
    generatedAt: options.generatedAt,
  });
  const viewModel = buildViewModel(timetable, {
    title: 'My timetable',
    courses: selection.courses,
  });
  return {
    ...state,
    selection,
    timetable,
    viewModel,
    notice: null,
    step: options.step ?? state.step,
    calendar: initialState().calendar,
  };
}

function previewSelectionNow(state) {
  if (!state.periodDataset?.entries) return null;
  return selectCourses(state.periodDataset.entries, state.selected);
}

/**
 * Apply a period choice: project the (untouched) full dataset and drop any
 * timetable that was generated for a different period. The student's course
 * picks survive — courses without lessons in the new period simply show up as
 * "not in this timetable" instead of silently vanishing.
 */
function withPeriod(state, period) {
  const periodDataset = projectDataset(state.dataset, period);
  const next = { ...clearGenerated(state), period, periodDataset };
  if (!periodDataset?.entries.length) return withNotice(next, 'error', NOTICE_COPY['empty-period']);
  return next;
}

function calendarFailed(state, message) {
  return withNotice(
    {
      ...state,
      calendar: { ...state.calendar, status: 'error', error: message },
    },
    'error',
    `Calendar export failed: ${message} Your timetable is still here — you can try again.`,
  );
}

/**
 * @param {object} state
 * @param {{type: string, [key: string]: any}} action
 * @returns {object} next state (never mutates the input)
 */
export function reduce(state, action) {
  switch (action.type) {
    case 'upload/started':
      return {
        ...initialState(),
        status: 'parsing',
        stage: PARSE_STAGES[0],
        filename: action.filename ?? null,
        template: state.template,
        student: state.student,
        reminderMinutes: state.reminderMinutes,
      };

    case 'upload/stage':
      if (state.status !== 'parsing') return state;
      return { ...state, stage: action.stage ?? state.stage };

    case 'upload/succeeded': {
      const dataset = action.dataset;
      if (!dataset?.entries?.length) {
        return {
          ...state,
          status: 'error',
          stage: null,
          error: { kind: 'no-lessons', message: parseErrorCopy('no-lessons') },
          notice: { kind: 'error', text: parseErrorCopy('no-lessons') },
          step: 'upload',
        };
      }
      return {
        ...state,
        status: 'loaded',
        stage: null,
        error: null,
        dataset,
        // a new workbook is a new source of truth: no period survives it
        period: null,
        periodDataset: null,
        periodDraft: { from: '', to: '' },
        notice: null,
        step: 'upload',
      };
    }

    case 'upload/failed':
      return {
        ...state,
        status: 'error',
        stage: null,
        dataset: null,
        period: null,
        periodDataset: null,
        periodDraft: { from: '', to: '' },
        error: {
          kind: action.kind ?? 'unreadable',
          message: action.message ?? parseErrorCopy(action.kind),
        },
        notice: { kind: 'error', text: action.message ?? parseErrorCopy(action.kind) },
        step: 'upload',
      };

    case 'upload/reset':
      return initialState({ template: state.template, student: state.student, reminderMinutes: state.reminderMinutes });

    case 'upload/continue': {
      if (!state.dataset) return withNotice(state, 'error', NOTICE_COPY['no-dataset']);
      return { ...state, step: 'period', notice: null };
    }

    case 'period/select': {
      if (!state.dataset) return withNotice(state, 'error', NOTICE_COPY['no-dataset']);
      const period = periodById(state.dataset.entries, action.id);
      if (!period) return state;
      if (samePeriod(state.period, period) && state.periodDataset) return state;
      return withPeriod(state, period);
    }

    case 'period/range/set': {
      const field = action.field === 'to' ? 'to' : 'from';
      return { ...state, periodDraft: { ...state.periodDraft, [field]: String(action.value ?? '') } };
    }

    case 'period/range/apply': {
      if (!state.dataset) return withNotice(state, 'error', NOTICE_COPY['no-dataset']);
      const { from, to } = state.periodDraft;
      const problem = rangeProblem(from, to, datasetBounds(state.dataset.entries));
      if (problem) return withNotice(state, 'error', NOTICE_COPY[`range-${problem}`]);
      return withPeriod(state, customPeriod(from, to));
    }

    case 'period/continue': {
      if (!state.dataset) return withNotice(state, 'error', NOTICE_COPY['no-dataset']);
      if (!state.period || !state.periodDataset) return withNotice(state, 'error', NOTICE_COPY['no-period']);
      if (!state.periodDataset.entries.length) return withNotice(state, 'error', NOTICE_COPY['empty-period']);
      return { ...state, step: 'courses', notice: null };
    }

    case 'search/set':
      return { ...state, search: action.value ?? '' };

    case 'course/toggle': {
      if (!action.code) return state;
      const has = state.selected.includes(action.code);
      const selected = has
        ? state.selected.filter((code) => code !== action.code)
        : [...state.selected, action.code];
      // The generated timetable is derived from the selection: changing it
      // invalidates it instead of silently serving stale lessons.
      return clearGenerated(state, { selected });
    }

    case 'course/remove': {
      if (!action.code || !state.selected.includes(action.code)) return state;
      return clearGenerated(state, { selected: state.selected.filter((code) => code !== action.code) });
    }

    case 'student/set':
      return { ...state, student: action.value ?? '' };

    case 'template/select':
      if (!TEMPLATES.some((template) => template.id === action.id)) return state;
      return { ...state, template: action.id };

    case 'notice/clear':
      return state.notice ? { ...state, notice: null } : state;

    case 'courses/continue': {
      if (!state.dataset) return withNotice(state, 'error', NOTICE_COPY['no-dataset']);
      if (!state.period || !state.periodDataset) return withNotice(state, 'error', NOTICE_COPY['no-period']);
      if (!state.selected.length) return withNotice(state, 'error', NOTICE_COPY['no-courses']);
      const selection = previewSelectionNow(state);
      if (!selection.entries.length) return withNotice(state, 'error', NOTICE_COPY['no-match']);
      return generate(state, { selection, step: 'design', generatedAt: action.generatedAt });
    }

    case 'step/goto': {
      const target = action.step;
      if (!STEP_IDS.includes(target)) return state;
      if (target === 'upload') return { ...state, step: 'upload', notice: null };
      if (target === 'period') {
        if (!state.dataset) return withNotice(state, 'error', NOTICE_COPY['no-dataset']);
        return { ...state, step: 'period', notice: null };
      }
      if (!state.dataset) return withNotice(state, 'error', NOTICE_COPY['no-dataset']);
      if (target === 'courses') {
        if (!state.period || !state.periodDataset) return withNotice(state, 'error', NOTICE_COPY['no-period']);
        return { ...state, step: 'courses', notice: null };
      }
      if (target === 'design' && (!state.period || !state.periodDataset)) {
        return withNotice(state, 'error', NOTICE_COPY['no-period']);
      }
      if (!state.timetable && target === 'design' && state.selected.length) {
        return reduce(state, { type: 'courses/continue', generatedAt: action.generatedAt });
      }
      if (!state.timetable) return withNotice(state, 'error', NOTICE_COPY['no-timetable']);
      if (target === 'preview' || target === 'calendar') {
        return { ...state, step: target, notice: null };
      }
      return { ...state, step: target, notice: null };
    }

    case 'regenerate':
      if (!state.selection) return state;
      return generate(state, { step: state.step });

    case 'preview/confirm':
      if (!state.timetable) return withNotice(state, 'error', NOTICE_COPY['no-timetable']);
      return { ...state, step: 'calendar', notice: null };

    case 'calendar/reminder/set': {
      const minutes = Number(action.minutes);
      if (!REMINDER_CHOICES.includes(minutes)) return state;
      if (minutes === state.reminderMinutes) return state;
      // the prepared file no longer matches the chosen reminder
      return { ...state, reminderMinutes: minutes, calendar: initialState().calendar };
    }

    case 'calendar/prepare': {
      if (!state.timetable) return withNotice(state, 'error', NOTICE_COPY['no-timetable']);
      try {
        const { ics, events, skipped } = toICalendar(state.timetable.entries, {
          student: state.student.trim() || null,
          calendarName: CALENDAR_NAME,
          dtStamp: action.dtStamp,
          alarmMinutes: state.reminderMinutes,
        });
        if (!events.length) return calendarFailed(state, 'No events could be created from this timetable.');
        return {
          ...state,
          calendar: { status: 'ready', error: null, ics, events: events.length, skipped: skipped.length },
          notice: null,
        };
      } catch (error) {
        return calendarFailed(state, error?.message ?? 'the calendar file could not be generated.');
      }
    }

    case 'calendar/exported':
      if (state.calendar.status !== 'ready' && state.calendar.status !== 'exported') return state;
      return { ...state, step: 'complete', calendar: { ...state.calendar, status: 'exported' }, notice: null };

    case 'calendar/failed':
      return calendarFailed(state, action.message ?? 'the file could not be saved.');

    case 'calendar/retry':
      return {
        ...state,
        calendar: initialState().calendar,
        notice: null,
        step: state.step === 'complete' ? 'calendar' : state.step,
      };

    default:
      return state;
  }
}
