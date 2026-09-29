/*
 * MivaPulse → TimetableFlow host adapter.
 *
 * The TimetableFlow engine (timetableflow/) is a standalone ES-module app.
 * This adapter is the only host code that knows about it. It:
 *   - exposes Timetable as a Study Lab tool (an in-page view, so returning to
 *     Study Lab never navigates away and never loses the timetable);
 *   - lazy-loads the engine on first use — the dashboard and the rest of
 *     Study Lab never download the engine or ExcelJS;
 *   - provides the mount contract the engine expects (#app and #tf-status,
 *     already declared in studylab.html);
 *   - keeps the engine mounted while the student uses other tools, so the
 *     timetable survives a round trip without re-uploading.
 *
 * It deliberately contains NO domain logic: no parsing, date handling, course
 * matching, link resolution, confidence rules, overlap detection or calendar
 * generation. All of that stays inside the engine.
 */

document.addEventListener('DOMContentLoaded', () => {
    const tabNotes = document.getElementById('tabNotes');
    const tabTimetable = document.getElementById('tabTimetable');
    const notesView = document.getElementById('notesView');
    const timetableView = document.getElementById('timetableView');
    if (!tabNotes || !tabTimetable || !notesView || !timetableView) return;

    const ENGINE_MODULE = '/timetableflow/public/app.js';
    const ENGINE_STYLES = '/timetableflow/public/styles.css';
    const ENGINE_EXCELJS = '/timetableflow/public/vendor/exceljs.min.js';

    let engineLoaded = false;
    let engineLoading = null;

    function selectTool(name) {
        const timetable = name === 'timetable';
        tabTimetable.classList.toggle('active', timetable);
        tabNotes.classList.toggle('active', !timetable);
        tabTimetable.setAttribute('aria-selected', String(timetable));
        tabNotes.setAttribute('aria-selected', String(!timetable));
        timetableView.hidden = !timetable;
        notesView.hidden = timetable;
    }

    /** Load a classic script once and wait for it (the engine injects ExcelJS through it). */
    function loadScript(src, datasetKey) {
        if (document.querySelector(`script[data-${datasetKey}]`)) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.dataset[datasetKey] = '';
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(script);
        });
    }

    async function loadEngine() {
        // The engine's stylesheet is injected on first use, not with the page.
        if (!document.querySelector('link[data-tf-styles]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = ENGINE_STYLES;
            link.dataset.tfStyles = '';
            document.head.appendChild(link);
        }
        // ExcelJS arrives as a classic-script global; the engine's glue detects
        // that global when its module evaluates, so the bundle must be loaded first.
        await loadScript(ENGINE_EXCELJS, 'tfExceljs');
        // The engine's glue auto-mounts into #app on import. The import map in
        // studylab.html resolves its "/src/*" imports to the engine tree.
        await import(ENGINE_MODULE);
    }

    async function openTimetable() {
        selectTool('timetable');
        if (engineLoaded) return; // already open: state preserved, no re-import
        engineLoading ??= loadEngine()
            .then(() => { engineLoaded = true; })
            .catch((error) => {
                engineLoading = null; // allow a retry after a transient failure
                throw error;
            });
        await engineLoading;
    }

    function showLoadError() {
        const previous = timetableView.querySelector('.workspace-error');
        if (previous) previous.remove();
        const message = document.createElement('p');
        message.className = 'workspace-error';
        message.textContent = 'The timetable tool could not be loaded. Check your connection and try again.';
        timetableView.appendChild(message);
    }

    tabTimetable.addEventListener('click', () => {
        openTimetable().catch((error) => {
            console.error('Timetable workspace failed to load:', error);
            showLoadError();
        });
    });
    tabNotes.addEventListener('click', () => selectTool('notes'));
});
