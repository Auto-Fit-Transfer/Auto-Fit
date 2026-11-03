// Android and the web wrap Korean between any two syllables, so a line can end in the middle
// of a word ("닦아/요"). An invisible word joiner between the letters of each Korean word leaves
// the spaces as the only places a line can break. iOS has a native setting instead (see Text).
export const WORD_JOINER = String.fromCharCode(0x2060);

const HANGUL = /[ㄱ-ㆎ가-힣]/;
// Marks, joiners and variation selectors belong to the character before them.
const ATTACHED = new RegExp(
  '[\\u0300-\\u036f\\u200b-\\u200f\\u2060\\u20d0-\\u20ff\\ufe00-\\ufe0f]',
);
const SPACE = /\s/;

export function keepKoreanWords(text: string): string {
  if (!HANGUL.test(text)) return text;
  let result = '';
  for (let index = 0; index < text.length; index += 1) {
    const current = text[index];
    const next = text[index + 1];
    result += current;
    if (next === undefined || SPACE.test(current) || SPACE.test(next)) continue;
    if (ATTACHED.test(current) || ATTACHED.test(next)) continue;
    if (HANGUL.test(current) || HANGUL.test(next)) result += WORD_JOINER;
  }
  return result;
}
