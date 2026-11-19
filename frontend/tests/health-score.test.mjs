import assert from 'node:assert/strict';
import test from 'node:test';
import { confirmNotice, scoreCard } from '../src/features/healthScore.ts';

const latest = (score_status, overall_score, status, score) => ({
  assessment_id: 'a', assessed_at: '2026-11-18T07:00:00Z', score_status, overall_score, health_data: { status, score },
});

test('a partial assessment shows only the health-data score', () => {
  assert.deepEqual(scoreCard(latest('partial', null, 'available', 80), { score: null, total: 100 }), { kind: 'partial', score: 80 });
});

test('a finished assessment shows its overall score', () => {
  assert.deepEqual(scoreCard(latest('available', 72, 'available', 80), { score: 70, total: 100 }), { kind: 'overall', score: 72, total: 100 });
});

test('a partial assessment that could not score its data asks to check the measurements', () => {
  assert.deepEqual(scoreCard(latest('partial', null, 'unavailable', null), null), { kind: 'check' });
});

test('no assessment is never a 0, and an error is never "no score"', () => {
  assert.deepEqual(scoreCard('missing', { score: null, total: 100 }), { kind: 'none' });
  assert.deepEqual(scoreCard('missing', { score: 64, total: 100 }), { kind: 'overall', score: 64, total: 100 });
  assert.deepEqual(scoreCard('failed', { score: 64, total: 100 }), { kind: 'failed' });
});

test('after confirming, a failed analysis is retried with the same ids', () => {
  const notice = confirmNotice([
    { analysis_status: 'failed', document_type: 'health_checkup', uploaded_file_id: 'x' },
    { analysis_status: 'saved', document_type: 'body_composition', uploaded_file_id: 'y' },
  ]);
  assert.deepEqual(notice.retry, ['x']);
});

test('one kind confirmed asks for the other kind; saved or an older server says nothing', () => {
  assert.match(confirmNotice([{ analysis_status: 'waiting_for_documents', document_type: 'health_checkup', uploaded_file_id: 'x' }]).body, /인바디/);
  assert.equal(confirmNotice([{ analysis_status: 'saved', document_type: 'health_checkup', uploaded_file_id: 'x' }]), null);
  assert.equal(confirmNotice([{ document_type: 'health_checkup', uploaded_file_id: 'x' }]), null);
});
