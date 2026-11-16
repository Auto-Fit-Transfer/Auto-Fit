import assert from 'node:assert/strict';
import test from 'node:test';
import { newestOfEachKind, paperNumbers } from '../src/features/a/paperNumbers.ts';

const base = { file_name: 'a.jpg', ocr_status: 'completed', status: 'confirmed', uploaded_file_id: '1' };

test('an inbody paper gives height, weight and body fat with the day on the paper', () => {
  const numbers = paperNumbers({
    ...base,
    document_type: 'body_composition',
    uploaded_at: '2026-11-11T03:00:00Z',
    extracted_data: { height_cm: '163.0', weight_kg: '55.0', body_fat_percentage: '27.1', measured_at: '2026-11-03T09:00:00' },
  });
  assert.equal(numbers.kind, '인바디');
  assert.equal(numbers.day, '11월 3일');
  assert.deepEqual(numbers.items.map((item) => `${item.label} ${item.value}${item.unit}`), ['키 163.0cm', '체중 55.0kg', '체지방률 27.1%']);
});

test('a checkup paper joins the two blood pressure numbers, and a number that was not read stays empty', () => {
  const numbers = paperNumbers({
    ...base,
    document_type: 'health_checkup',
    uploaded_at: '2026-09-14T03:00:00Z',
    extracted_data: { systolic_bp: 118, diastolic_bp: 76, fasting_glucose: '104', total_cholesterol: null, checkup_date: '2026-09-12' },
  });
  assert.equal(numbers.day, '9월 12일');
  assert.deepEqual(numbers.items.map((item) => item.value), ['118/76', '104', '']);
  const half = paperNumbers({ ...base, document_type: 'health_checkup', uploaded_at: '2026-09-14T03:00:00Z', extracted_data: { systolic_bp: 118 } });
  assert.equal(half.items[0].value, '');
  assert.equal(half.day, '9월 14일');
});

test('the paper given last of each kind is picked, inbody first', () => {
  const list = [
    { document_type: 'health_checkup', uploaded_at: '2026-09-14T03:00:00Z', uploaded_file_id: 'c1' },
    { document_type: 'body_composition', uploaded_at: '2026-11-03T03:00:00Z', uploaded_file_id: 'b1' },
    { document_type: 'body_composition', uploaded_at: '2026-11-11T03:00:00Z', uploaded_file_id: 'b2' },
  ];
  assert.deepEqual(newestOfEachKind(list).map((item) => item.uploaded_file_id), ['b2', 'c1']);
  assert.deepEqual(newestOfEachKind([list[0]]).map((item) => item.uploaded_file_id), ['c1']);
  assert.deepEqual(newestOfEachKind([]), []);
});
