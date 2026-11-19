import type { RebalancePreview, WeeklyDay, WeeklyFeedbackRecord } from '../../api/diet';
import type { TomorrowPlan } from '../../components/a/TomorrowSheet';
import type { MealStatus, MealType } from './dayMeals';

// Renewal A records against the week's plan (back-end 01a28952). A meal recorded earlier in the daily app
// (legacy) shows as recorded but cannot be saved again here: the server refuses the double record.
const statusOf: Record<WeeklyFeedbackRecord['feedback_type'], MealStatus> = {
  eaten: 'eaten',
  different_food: 'modified',
  skipped: 'skipped',
};

export function weeklyStatuses(day: WeeklyDay | null, feedback: WeeklyFeedbackRecord[], legacy: WeeklyFeedbackRecord[]) {
  const statuses: Partial<Record<MealType, MealStatus>> = {};
  const recorded = new Set<MealType>();
  const locked = new Set<MealType>();
  for (const [list, isLegacy] of [[legacy, true], [feedback, false]] as const) {
    for (const item of list) {
      if (item.plan_day !== day) continue;
      statuses[item.meal_type] = statusOf[item.feedback_type];
      if (isLegacy) locked.add(item.meal_type);
      else recorded.add(item.meal_type);
    }
  }
  return { statuses, recorded, locked };
}

// The server's tomorrow preview, as the 내일 맞추기 sheet shows it.
export function previewPlan(preview: RebalancePreview, titles: Record<MealType, string>): TomorrowPlan {
  const { tomorrow } = preview;
  return {
    meals: tomorrow.meals.map((meal) => {
      const shown = meal.status === 'ready' && meal.after ? meal.after : meal.before;
      return { slot: titles[meal.meal_type], menu: shown.menu_name, kcal: Math.round(shown.estimated_calories_kcal), changed: meal.status === 'ready' };
    }),
    kcal: Math.round(tomorrow.total_after_kcal),
    target: Math.round(tomorrow.daily_target_kcal),
    why: null,
    cut: Math.round(tomorrow.actual_reduction_kcal),
    left: Math.round(tomorrow.unapplied_reduction_kcal),
    failed: preview.failed_meal_types.length,
    canSave: Boolean(preview.preview_id),
  };
}
