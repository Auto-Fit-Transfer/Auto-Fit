// 일반식 / 건강식 for the week's 21 main meals (ai 4615d07 contract, 11/19). Snacks are not part of it.
// The app sends only these two; someone who never chose gets the back-end's mix (balanced).
export type MenuStyle = 'everyday' | 'health_focused';

export const menuStyleLabel = (style: MenuStyle | null | undefined) =>
  style === 'health_focused' ? '건강식 위주' : style === 'everyday' ? '일반식 위주' : '메뉴 고르기';

// What to say when the week's meals cannot be made in the chosen style (contract 4.2); null = the usual message.
export function menuStyleFailure(status: number | undefined) {
  if (status === 422) return '내 정보(나이 · 성별)와 건강 서류 상태를 확인해 주세요.';
  if (status === 503) return '이 방식에 맞는 안전한 메뉴가 부족해요. 다른 방식으로 바꾸거나 다시 시도해 주세요.';
  return null;
}
