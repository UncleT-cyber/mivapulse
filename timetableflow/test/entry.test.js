import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  validateEntry,
  validateEntries,
  toPublicEntry,
  toDatasetEntry,
} from '../src/model/entry.js';
import { linkState } from '../src/student/timetable.js';
import { makeEntry, makeConflictedEntry, makeUnlinkedEntry } from './helpers/entryFactory.js';

test('a normalized entry validates cleanly', () => {
  assert.deepEqual(validateEntry(makeEntry()), []);
  const { valid, invalid } = validateEntries([makeEntry(), makeEntry({ courseCode: 'SEN 306' })]);
  assert.equal(valid, 2);
  assert.deepEqual(invalid, []);
});

test('structural validation rejects broken entries', () => {
  assert.ok(validateEntry({}).includes('missing-required-field:courseCode'));
  assert.ok(validateEntry(makeEntry({ date: '14/09/2026' }))[0].startsWith('bad-date:'));
  assert.ok(validateEntry(makeEntry({ startTime: '5:00' }))[0].startsWith('bad-startTime:'));
  assert.ok(
    validateEntry(makeEntry({ startTime: '16:00', endTime: '15:00' })).includes('end-before-start'),
  );
  assert.ok(validateEntry(makeEntry({ lessonUrl: 'meet.google.com/x' }))[0].startsWith('bad-lessonUrl:'));
});

test('a conflicted entry must not carry a URL', () => {
  const conflicted = makeConflictedEntry();
  assert.deepEqual(validateEntry(conflicted), []); // lessonUrl null + conflict => valid
  const wrong = { ...conflicted, lessonUrl: 'http://meet.google.com/pick-one' };
  assert.ok(validateEntry(wrong).includes('conflict-must-not-pick-a-url'));
});

test('toPublicEntry is the UI projection (match reduced to tier + flag)', () => {
  const publicEntry = toPublicEntry(makeConflictedEntry());
  assert.equal(publicEntry.matchTier, 'exact');
  assert.equal(publicEntry.ambiguous, true);
  assert.ok(!('rawCellText' in publicEntry));
  assert.ok(!('match' in publicEntry));
  assert.ok(!('conflict' in publicEntry));
});

test('toDatasetEntry survives a JSON round-trip with its conflict intact', () => {
  const conflicted = makeConflictedEntry();
  const dataset = JSON.parse(JSON.stringify(toDatasetEntry(conflicted)));

  assert.equal(dataset.lessonUrl, null);
  assert.equal(dataset.match.tier, 'exact');
  assert.equal(dataset.match.rule, 'exact-course-code');
  assert.equal(dataset.match.ambiguous, true);
  assert.equal(dataset.match.titleMismatch, false);
  assert.equal(dataset.conflict.reason, 'same-course-code-maps-to-multiple-urls');
  assert.equal(dataset.candidates.length, 2);
  assert.equal(dataset.sourceCell, conflicted.sourceCell);

  // Phase 6 reads exactly this shape: the conflict is still visible
  assert.equal(linkState(dataset), 'needs-verification');
  assert.equal(linkState(toDatasetEntry(makeEntry())), 'verified');
  assert.equal(linkState(toDatasetEntry(makeUnlinkedEntry())), 'missing');
});

test('toDatasetEntry keeps provenance and warnings for auditability', () => {
  const dataset = toDatasetEntry(
    makeEntry({ warnings: ['recovered-missing-separator'], lessonUrl: null }),
  );
  assert.deepEqual(dataset.warnings, ['recovered-missing-separator']);
  assert.equal(dataset.sourceSheet, 'Fixture Sep 2026 Lesson Time');
  assert.equal(dataset.rawCellText, 'IFT 211 - Digital Logic Design');
  assert.equal(dataset.candidates, undefined); // only written when there is a real choice
});
