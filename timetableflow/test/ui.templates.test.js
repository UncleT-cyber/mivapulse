/**
 * Phase 7 — templates are presentation only.
 *
 * All six templates render the SAME view model through the SAME renderer:
 * identical content, different decoration, zero mutation of domain data.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { loadWorkbook, processWorkbook } from '../src/index.js';
import { buildStudentTimetable } from '../src/student/timetable.js';
import { buildViewModel } from '../src/render/viewModel.js';
import { TEMPLATES, DEFAULT_TEMPLATE_ID, getTemplate, renderTimetable } from '../src/ui/templates.js';
import { buildFixtureBuffer } from './helpers/fixtureWorkbook.js';
import { stripTags } from './helpers/uiFlow.js';

const dataset = processWorkbook(await loadWorkbook(await buildFixtureBuffer()));
const timetable = buildStudentTimetable(dataset.entries, { student: 'Test Student' });
const viewModel = buildViewModel(timetable, { title: 'My timetable' });

const EXPECTED_IDS = ['minimal', 'color-pop', 'glass', 'dark', 'focus', 'timeline'];
const FORBIDDEN = ['worksheet', 'ExcelJS', 'rawCellText', 'sourceSheet', 'sourceCell', 'TBA', 'Unknown Lecturer', 'Unknown Topic'];

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

test('the template registry offers exactly the six promised looks', () => {
  assert.deepEqual(TEMPLATES.map((template) => template.id), EXPECTED_IDS);
  assert.equal(new Set(EXPECTED_IDS).size, TEMPLATES.length, 'ids are unique');
  assert.equal(DEFAULT_TEMPLATE_ID, 'minimal');
  for (const template of TEMPLATES) {
    assert.ok(template.name.length > 0);
    assert.ok(template.description.length > 0);
    assert.ok(['grid', 'timeline'].includes(template.layout));
  }
  assert.equal(getTemplate('nope').id, 'minimal', 'unknown ids fall back safely');
  assert.equal(getTemplate('dark').id, 'dark');
});

test('every template renders the real timetable content', () => {
  for (const template of TEMPLATES) {
    const html = renderTimetable(viewModel, template.id);
    assert.ok(html.includes(`data-template="${template.id}"`), `${template.id} marks itself`);
    assert.ok(html.includes(`data-layout="${template.layout}"`), `${template.id} uses its layout`);

    for (const code of ['IFT 211', 'NSC 309', 'MCM 101', 'ECO 306']) {
      assert.ok(html.includes(code), `${template.id} renders ${code}`);
    }
    assert.ok(html.includes('Monday, 14 Sep 2026'), `${template.id} renders day headings`);
    assert.ok(html.includes('Join live lesson'), `${template.id} shows verified links`);
    assert.ok(html.includes('Lesson link needs verification'), `${template.id} shows ambiguous links`);
    assert.ok(html.includes('Live lesson link unavailable'), `${template.id} shows missing links`);
    assert.ok(html.includes('Schedule conflict'), `${template.id} reports conflicts`);
    assert.ok(html.includes('Good to know'), `${template.id} shows notes`);

    for (const token of FORBIDDEN) {
      assert.ok(!html.includes(token), `${template.id} leaks "${token}"`);
    }
  }
});

test('all templates show the same information — only decoration differs', () => {
  const gridTemplates = TEMPLATES.filter((template) => template.layout === 'grid');
  assert.ok(gridTemplates.length >= 4, 'most templates share the weekly grid renderer');

  const gridHtml = gridTemplates.map((template) => renderTimetable(viewModel, template.id));
  const gridTexts = gridHtml.map(stripTags);
  gridTexts.forEach((text, index) => {
    assert.equal(text, gridTexts[0], `${gridTemplates[index].id} renders the same content as ${gridTemplates[0].id}`);
  });

  const facts = (html) => ({
    lessons: [...html.matchAll(/data-course="([^"]+)"/g)].map((match) => match[1]).sort(),
    days: [...new Set([...html.matchAll(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), \d{1,2} \w{3} \d{4}/g)].map((match) => match[0]))].sort(),
    times: [...new Set([...html.matchAll(/\b\d{2}:\d{2}\b/g)].map((match) => match[0]))].sort(),
    linkCopy: ['Join live lesson', 'Lesson link needs verification', 'Live lesson link unavailable'].map(
      (copy) => `${copy}: ${html.split(copy).length - 1}`,
    ),
    conflicts: html.split('These lessons overlap').length - 1,
    notes: ['needs verification', 'no live-lesson link', 'two selected lessons overlap'].map(
      (token) => `${token}: ${html.includes(token)}`,
    ),
  });

  const expected = facts(gridHtml[0]);
  for (const template of TEMPLATES) {
    const actual = facts(renderTimetable(viewModel, template.id));
    assert.deepEqual(actual.lessons, expected.lessons, `${template.id} shows every lesson`);
    assert.deepEqual(actual.days, expected.days, `${template.id} shows the same days`);
    assert.deepEqual(actual.linkCopy, expected.linkCopy, `${template.id} keeps the link states`);
    assert.equal(actual.conflicts, expected.conflicts, `${template.id} reports the same conflicts`);
    assert.deepEqual(actual.notes, expected.notes, `${template.id} keeps the notes`);
    for (const time of actual.times) {
      assert.ok(expected.times.includes(time), `${template.id} invents the time ${time}`);
    }
  }

  const timeline = renderTimetable(viewModel, 'timeline');
  const grid = renderTimetable(viewModel, 'minimal');
  for (const day of expected.days) {
    assert.ok(timeline.includes(day), `the timeline shows ${day}`);
    assert.ok(grid.includes(day), `the grid shows ${day}`);
  }
});

test('layout and colour hooks stay decorative', () => {
  const minimal = renderTimetable(viewModel, 'minimal');
  const colourPop = renderTimetable(viewModel, 'color-pop');
  const timeline = renderTimetable(viewModel, 'timeline');

  assert.ok(!minimal.includes('--tf-course-hue'), 'minimal stays neutral');
  assert.ok(colourPop.includes('--tf-course-hue'), 'color pop colour-codes courses');
  assert.ok(timeline.includes('data-layout="timeline"'), 'the mobile timeline is a timeline');
  assert.ok(timeline.includes('tf-timeline'), 'timeline markup');
  assert.ok(!timeline.includes('tf-grid'), 'timeline does not fall back to a grid');
  assert.ok(minimal.includes('tf-grid'), 'minimal uses the grid layout');
});

test('rendering never mutates the view model or the domain data', () => {
  const frozenViewModel = deepFreeze(
    buildViewModel(buildStudentTimetable(dataset.entries, { student: 'Test Student' }), { title: 'Frozen' }),
  );
  const snapshot = JSON.stringify(frozenViewModel);

  for (const template of TEMPLATES) {
    // the view model is frozen: any mutation would throw in strict mode
    renderTimetable(frozenViewModel, template.id);
    renderTimetable(frozenViewModel, template.id, { limit: 4, preview: true });
    renderTimetable(frozenViewModel, template.id, { limit: 4, preview: false, showConflicts: false, showNotes: false });
  }

  assert.equal(JSON.stringify(frozenViewModel), snapshot, 'the view model is byte-identical after rendering');
  assert.equal(Object.isFrozen(frozenViewModel), true);
});

test('a limited preview is honest about how much it shows', () => {
  const full = renderTimetable(viewModel, 'minimal');
  const preview = renderTimetable(viewModel, 'minimal', { limit: 4, preview: true });

  const countLessons = (html) => html.split('class="tf-lesson ').length - 1;
  assert.equal(countLessons(preview), 4, 'the preview shows exactly the promised lessons');
  assert.ok(preview.includes(`Showing 4 of ${viewModel.summary.lessons} lessons`), 'the preview says how much is hidden');
  assert.equal(countLessons(full), viewModel.summary.lessons, 'the full timetable shows everything');

  const unknown = renderTimetable(viewModel, 'does-not-exist');
  assert.ok(unknown.includes('data-template="minimal"'), 'unknown templates fall back');
});
