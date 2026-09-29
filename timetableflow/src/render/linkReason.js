/**
 * Why a lesson link is held back from `verified`.
 *
 * The public link state stays three-valued (verified / needs-verification /
 * missing); the reason lives underneath it so the same wording is used by every
 * renderer (browser UI and the downloadable HTML timetable).
 *
 * Every string is a statement about the join that already happened — nothing is
 * invented, no candidate is ever chosen for the student.
 */

export const LINK_REASON_COPY = {
  'conflicting-candidates': 'More than one link row carries this course code.',
  'title-only-match': 'No link row carries this course code, so the match rests on the course title alone.',
  'title-mismatch': 'The link row carries a different course title than the timetable.',
};

/**
 * Human sentence for `link.reason` (see src/render/viewModel.js publicLink).
 * @param {{state?: string, reason?: string|null, linkTitle?: string|null}} link
 * @returns {string} '' when the link needs no explanation
 */
export function linkReasonText(link) {
  if (!link || link.state !== 'needs-verification' || !link.reason) return '';
  if (link.reason === 'title-mismatch' && link.linkTitle) {
    return `The link row is titled "${link.linkTitle}" — check it is your class before joining.`;
  }
  return LINK_REASON_COPY[link.reason] ?? '';
}
