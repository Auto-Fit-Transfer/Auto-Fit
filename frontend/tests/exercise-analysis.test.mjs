import assert from 'node:assert/strict';
import test from 'node:test';
import { mapExerciseAnalysis } from '../src/features/exercise/exerciseAnalysis.ts';

test('report preserves incomplete performance, discomfort and server guidance', () => {
  const report = mapExerciseAnalysis({
    generator: 'rules_v1',
    summary: '운동을 종료했습니다.',
    metrics: { completion_rate: 40, duration_minutes: 12, calories_burned: 50 },
    feedback_summary: {
      difficulty: '어려움',
      post_condition: '나쁨',
      uncomfortable_areas: ['knee'],
    },
    insights: ['회복이 필요합니다.'],
    next_session_adjustments: ['다음 운동 강도를 낮춤'],
    safety_notice: '불편이 지속되면 상담하세요.',
  });
  assert.equal(report.metrics[0].value, '40%');
  assert.equal(report.metrics[1].value, '어려움');
  assert.equal(report.metrics[2].value, '나쁨');
  assert.equal(report.metrics[3].value, '무릎');
  assert.match(report.insight.description, /불편이 지속/);
  assert.equal(report.nextWorkout[0].title, '다음 운동 강도를 낮춤');
});
