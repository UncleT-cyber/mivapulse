/**
 * Visual templates — presentation only.
 *
 * Every template consumes the SAME view model through the SAME renderer
 * (timetableBody.js). A template changes layout and decoration, never content:
 * there is exactly one implementation of lesson ordering, day grouping,
 * conflict detection and link states (src/student + src/render).
 */

import { renderTimetableBody } from './timetableBody.js';

export const TEMPLATES = [
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'The classic weekly grid — black on white, time rows by day columns.',
    layout: 'grid',
    coloured: false,
  },
  {
    id: 'color-pop',
    name: 'Color Pop',
    description: 'The weekly grid with every course in its own colour.',
    layout: 'grid',
    coloured: true,
  },
  {
    id: 'glass',
    name: 'Glass',
    description: 'The weekly grid on frosted glass with soft depth.',
    layout: 'grid',
    coloured: false,
  },
  {
    id: 'dark',
    name: 'Dark',
    description: 'The weekly grid for low light — dark surface, high contrast.',
    layout: 'grid',
    coloured: true,
  },
  {
    id: 'focus',
    name: 'Focus',
    description: 'A dense weekly grid: uppercase codes, no chrome.',
    layout: 'grid',
    coloured: false,
  },
  {
    id: 'timeline',
    name: 'Mobile Timeline',
    description: 'Not a grid: one day after another. Built for phones.',
    layout: 'timeline',
    coloured: true,
  },
];

export const DEFAULT_TEMPLATE_ID = 'minimal';

export function getTemplate(id) {
  return TEMPLATES.find((template) => template.id === id) ?? TEMPLATES.find((t) => t.id === DEFAULT_TEMPLATE_ID);
}

/**
 * @param {object} viewModel  output of buildViewModel()
 * @param {string} templateId
 * @param {object} [options]  forwarded to renderTimetableBody (limit, preview, …)
 * @returns {string} HTML for the chosen template
 */
export function renderTimetable(viewModel, templateId, options = {}) {
  const template = getTemplate(templateId);
  return renderTimetableBody(viewModel, {
    ...options,
    templateId: template.id,
    layout: template.layout,
    coloured: template.coloured,
  });
}
