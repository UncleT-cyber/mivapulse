/**
 * TimetableFlow UI glue.
 *
 * This is the browser application shell: DOM events -> actions -> pure reducer
 * (src/ui/state.js) -> pure HTML (src/ui/screens.js). All domain work stays in
 * the engine modules; the only I/O here is reading the chosen File and saving
 * the generated .ics through an object URL (never node:fs).
 */

import { initialState, reduce } from '/src/ui/state.js';
import { renderApp } from '/src/ui/screens.js';
import { calendarFilename, htmlFilename } from '/src/ui/selectors.js';
import { setExcelJS, parseWorkbookBytes } from '/src/app/excelAdapter.js';

const root = document.getElementById('app');
const live = document.getElementById('tf-status');

let state = initialState();
let previousStep = state.step;

function statusMessage() {
  if (state.status === 'parsing') return state.stage?.label ?? 'Processing timetable…';
  if (state.status === 'error' && state.error) return state.error.message;
  if (state.notice) return state.notice.text;
  if (state.step === 'upload' && state.status === 'loaded') return 'Timetable loaded.';
  return '';
}

function render() {
  const active = document.activeElement;
  const focusId = active && active.id ? active.id : null;
  const start = active && typeof active.selectionStart === 'number' ? active.selectionStart : null;
  const end = active && typeof active.selectionEnd === 'number' ? active.selectionEnd : null;

  root.innerHTML = renderApp(state);
  live.textContent = statusMessage();

  if (focusId) {
    const restored = document.getElementById(focusId);
    if (restored && typeof restored.focus === 'function') {
      restored.focus({ preventScroll: true });
      if (start !== null && typeof restored.setSelectionRange === 'function') {
        try {
          restored.setSelectionRange(start, end);
        } catch {
          /* type=search/number inputs may reject selection ranges */
        }
      }
    }
  }

  if (state.step !== previousStep) {
    previousStep = state.step;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
}

function dispatch(action) {
  if (action.type === 'calendar/download') {
    handleDownload();
    return;
  }
  if (action.type === 'calendar/download-html') {
    handleDownloadHtml();
    return;
  }
  const next = reduce(state, action);
  if (next !== state) {
    state = next;
    render();
  }
}

function saveCalendar(ics, filename) {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function saveHtml(html, filename) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function handleDownload() {
  if (state.calendar.status !== 'ready') {
    dispatch({ type: 'calendar/prepare' });
    if (state.calendar.status !== 'ready') return; // failure already surfaced, timetable kept
  }
  try {
    saveCalendar(state.calendar.ics, calendarFilename(state));
    dispatch({ type: 'calendar/exported' });
  } catch (error) {
    dispatch({ type: 'calendar/failed', message: error?.message });
  }
}

function handleDownloadHtml() {
  if (state.calendar.status !== 'ready') {
    dispatch({ type: 'calendar/prepare' });
    if (state.calendar.status !== 'ready') return;
  }
  try {
    saveHtml(state.calendar.html, htmlFilename(state));
    dispatch({ type: 'calendar/exported' });
  } catch (error) {
    dispatch({ type: 'calendar/failed', message: error?.message });
  }
}

async function handleFile(file) {
  dispatch({ type: 'upload/started', filename: file.name });
  try {
    const bytes = await file.arrayBuffer();
    const dataset = await parseWorkbookBytes(bytes, {
      filename: file.name,
      onStage: (stage) => dispatch({ type: 'upload/stage', stage }),
    });
    state = reduce(state, { type: 'upload/succeeded', dataset });
  } catch (error) {
    state = reduce(state, {
      type: 'upload/failed',
      kind: error?.kind ?? 'unreadable',
      message: error?.kind ? error.message : undefined,
    });
  }
  render();
}

function datasetForAction(element) {
  const payload = { type: element.dataset.action };
  if (element.dataset.step) payload.step = element.dataset.step;
  if (element.dataset.code) payload.code = element.dataset.code;
  if (element.dataset.id) payload.id = element.dataset.id;
  return payload;
}

root.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
  if (!target || target.tagName === 'INPUT') return;
  event.preventDefault();
  dispatch(datasetForAction(target));
});

root.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.dataset.action === 'search') dispatch({ type: 'search/set', value: target.value });
  if (target.dataset.action === 'student') dispatch({ type: 'student/set', value: target.value });
  if (target.dataset.action === 'period/from') {
    dispatch({ type: 'period/range/set', field: 'from', value: target.value });
  }
  if (target.dataset.action === 'period/to') {
    dispatch({ type: 'period/range/set', field: 'to', value: target.value });
  }
});

root.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.dataset.action === 'file') {
    const file = target.files && target.files[0];
    if (file) handleFile(file);
  }
  if (target.dataset.action === 'student') dispatch({ type: 'regenerate' });
  if (target.dataset.action === 'calendar/reminder/set') {
    dispatch({ type: 'calendar/reminder/set', minutes: Number(target.dataset.minutes) });
  }
});

function dropZoneFor(target) {
  return target instanceof Element ? target.closest('[data-drop]') : null;
}

root.addEventListener('dragover', (event) => {
  const zone = dropZoneFor(event.target);
  if (!zone) return;
  event.preventDefault();
  zone.classList.add('is-dragover');
});

root.addEventListener('dragleave', (event) => {
  const zone = dropZoneFor(event.target);
  if (zone) zone.classList.remove('is-dragover');
});

root.addEventListener('drop', (event) => {
  const zone = dropZoneFor(event.target);
  if (!zone) return;
  event.preventDefault();
  zone.classList.remove('is-dragover');
  const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
  if (file) handleFile(file);
});

// Excel implementation comes from the classic-script bundle (window.ExcelJS).
if (globalThis.ExcelJS && globalThis.ExcelJS.Workbook) setExcelJS(globalThis.ExcelJS);

render();

// Offline / installable: the service worker caches the app shell after the
// first visit so the timetable still opens without a connection.
if ('serviceWorker' in navigator && globalThis.isSecureContext) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    /* offline support is a progressive enhancement, never a hard failure */
  });
}
