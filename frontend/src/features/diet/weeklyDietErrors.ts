const serviceBusy = '식단 서비스가 잠시 응답하지 않아요. 잠시 후 다시 시도해 주세요.';
const unusableResult = '식단 결과를 확인하지 못했어요. 다시 시도해 주세요.';

// The server sends one generic sentence for these codes, so the app words each case itself.
const messages: Record<string, string> = {
  AI_UNAVAILABLE: serviceBusy,
  AI_TIMEOUT: serviceBusy,
  AI_CONNECTION_ERROR: serviceBusy,
  AI_DISABLED: serviceBusy,
  AI_CONFIGURATION_ERROR: serviceBusy,
  AI_INTERNAL_ERROR: serviceBusy,
  AI_HTTP_ERROR: serviceBusy,
  AI_AUTH_FAILED: serviceBusy,
  AI_INVALID_RESPONSE: unusableResult,
  AI_RESPONSE_TOO_LARGE: unusableResult,
  AI_SLOT_MISMATCH: unusableResult,
  AI_FOOD_RESTRICTION_CONFLICT:
    '알레르기와 피하는 음식을 지키는 식단을 만들지 못했어요. 안전을 위해 보여 드리지 않았어요.',
  AI_INPUT_REJECTED: '지금 조건으로는 식단을 만들 수 없어요. 조건을 확인한 뒤 다시 시도해 주세요.',
  AI_DUPLICATE_MENU: '다른 메뉴를 찾지 못했어요. 다시 시도해 주세요.',
  WEEKLY_DIET_STORAGE_ERROR: '식단을 저장하지 못했어요. 다시 시도해 주세요.',
  WEEKLY_DIET_VERSION_CONFLICT: '식단이 바뀌었어요. 새 식단을 불러온 뒤 다시 시도해 주세요.',
  WEEKLY_DIET_CONTEXT_CHANGED: '건강 정보가 바뀌었어요. 새 식단을 만든 뒤 다시 시도해 주세요.',
  WEEKLY_DIET_EXISTS: '이 주의 식단이 이미 있어요. 새로 불러와 주세요.',
  WEEKLY_DIET_INVALID_WEEK: '선택한 주를 확인해 주세요.',
};

export function weeklyDietErrorCode(detail: unknown): string | null {
  const code = (detail as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' ? code : null;
}

export function weeklyDietErrorMessage(detail: unknown): string | null {
  const code = weeklyDietErrorCode(detail);
  return code ? messages[code] ?? null : null;
}
