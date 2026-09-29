import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { buildStudentTimetable } from '../src/student/timetable.js';
import { buildViewModel } from '../src/render/viewModel.js';
import { renderHtml, escapeHtml } from '../src/render/html.js';
import { makeEntry, makeConflictedEntry, makeUnlinkedEntry } from './helpers/entryFactory.js';

function buildFixtureViewModel() {
  const timetable = buildStudentTimetable(
    [
      makeEntry({ date: '2026-09-14', day: 'Monday', courseCode: 'IFT 211', courseTitle: 'Digital Logic Design', startTime: '15:00', endTime: '16:00' }),
      makeConflictedEntry({ date: '2026-09-16', day: 'Wednesday', startTime: '15:00', endTime: '16:00' }),
      makeUnlinkedEntry({ date: '2026-09-16', day: 'Wednesday', courseCode: 'PAD 302', courseTitle: 'Administrative Behaviour', startTime: '16:00', endTime: '17:00' }),
      makeEntry({ date: '2026-09-14', day: 'Monday', startTime: '15:30', endTime: '16:30', courseCode: 'SEN 306', courseTitle: 'Software Construction' }),
    ],
    { student: 'Ada Obi', selection: ['IFT 211', 'NSC 309'], generatedAt: '2026-09-01T10:00:00.000Z' },
  );
  return buildViewModel(timetable, { title: 'Ada timetable' });
}

test('the view model exposes no Excel concepts', () => {
  const viewModel = buildFixtureViewModel();
  const serialized = JSON.stringify(viewModel);
  for (const forbidden of ['sourceSheet', 'sourceCell', 'sourceRow', 'rawCellText', 'worksheet', 'xlsx', 'Excel']) {
    assert.ok(!serialized.includes(forbidden), `view model leaked "${forbidden}"`);
  }
});

test('the view model carries link state, notes and summary', () => {
  const viewModel = buildFixtureViewModel();

  assert.equal(viewModel.student, 'Ada Obi');
  assert.equal(viewModel.summary.lessons, 4);
  assert.deepEqual(viewModel.summary.linkStates, { verified: 2, 'needs-verification': 1, missing: 1 });
  assert.equal(viewModel.summary.conflictPairs, 1);

  const states = viewModel.days.flatMap((day) => day.entries.map((entry) => entry.link.state));
  assert.deepEqual(states, ['verified', 'verified', 'needs-verification', 'missing']);

  const notes = viewModel.notes.map((note) => note.kind);
  assert.ok(notes.includes('needs-verification'));
  assert.ok(notes.includes('missing-link'));
  assert.ok(notes.includes('schedule-conflict'));
});

test('escapeHtml neutralizes markup in every position', () => {
  assert.equal(escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  assert.equal(escapeHtml("O'Brien & Co"), 'O&#39;Brien &amp; Co');
  assert.equal(escapeHtml(null), '');
});

test('the rendered HTML shows all three link states', () => {
  const html = renderHtml(buildFixtureViewModel());

  assert.ok(html.includes('Join lesson'));
  assert.ok(html.includes('Lesson link needs verification'));
  assert.ok(html.includes('No link yet'));
  assert.ok(html.includes('for Ada Obi'));
  assert.ok(html.includes('Monday, 14 Sep 2026'));
  assert.ok(html.includes('Wednesday, 16 Sep 2026'));
});

test('the rendered HTML never mentions Excel', () => {
  const html = renderHtml(buildFixtureViewModel()).toLowerCase();
  for (const forbidden of ['excel', 'xlsx', 'worksheet', 'workbook', 'sourcecell', 'sourcesheet']) {
    assert.ok(!html.includes(forbidden), `HTML leaked "${forbidden}"`);
  }
});

test('hostile titles are escaped in the rendered HTML', () => {
  const viewModel = buildFixtureViewModel();
  viewModel.days[0].entries[0].courseTitle = '<img src=x onerror=alert(1)>';
  const html = renderHtml(viewModel);

  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
});

test('the HTML is a complete standalone document', () => {
  const html = renderHtml(buildFixtureViewModel());
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(html.includes('<style>'));
  assert.ok(html.trimEnd().endsWith('</html>'));
});
