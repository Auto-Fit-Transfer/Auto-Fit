import AsyncStorage from '@react-native-async-storage/async-storage';

export const CHAT_CHARACTER_KEY = 'auto-fit.chat.character.v1';

export const chatCharacters = [
  { id: 'quni', name: '쿼니', role: '다정한 기본', description: '밝고 다정하게 함께 살펴봐요.' },
  { id: 'nabi', name: '나비', role: '느긋한 동행', description: '차분하고 편안하게 이야기해요.' },
  { id: 'coach', name: '매운맛 코치', role: '단호한 코치', description: '핵심을 짚는 단호한 말투로 도와줘요.' },
] as const;

export type ChatCharacterId = (typeof chatCharacters)[number]['id'];

const introductions: Record<ChatCharacterId, string> = {
  quni: '좋아요, 같이 살펴볼게요.',
  nabi: '천천히 확인해 볼게요.',
  coach: '핵심부터 확인하겠습니다.',
};

// How each one answers "3일째 운동을 못 했어요": shown where the character is chosen.
export const chatSamples: Record<ChatCharacterId, string> = {
  quni: '3일 동안 쉬었네요. 괜찮아요, 천천히 같이 해요. 오늘은 10분 걷기부터 어때요?',
  nabi: '흠, 3일째 조용하네. 뭐… 쉴 수도 있지. 오늘은 10분만 움직여.',
  coach: '3일 쉬었습니다. 핑계 금지. 스쿼트 30개, 지금 바로. 끝나면 한 세트 더.',
};

export const chatWelcomes: Record<ChatCharacterId, string> = {
  quni: '안녕하세요! 건강 점수와 식단·운동 기록을 같이 살펴봐요.',
  nabi: '안녕하세요. 편하게 이야기해 주세요. 천천히 함께 살펴볼게요.',
  coach: '반갑습니다. 건강 점수와 식단·운동 기록부터 확인해 보죠.',
};

export function displayChatAnswer(content: string, characterId: ChatCharacterId) {
  const previousIntroduction = Object.values(introductions).find((introduction) => content.startsWith(`${introduction}\n`));
  const answer = previousIntroduction ? content.slice(previousIntroduction.length + 1) : content;
  return `${introductions[characterId]}\n${answer}`;
}

export function getChatCharacter(id: string | null | undefined) {
  return chatCharacters.find((character) => character.id === id) ?? chatCharacters[0];
}

export async function loadChatCharacter() {
  try { return getChatCharacter(await AsyncStorage.getItem(CHAT_CHARACTER_KEY)); }
  catch { return chatCharacters[0]; }
}

export async function saveChatCharacter(id: ChatCharacterId) {
  await AsyncStorage.setItem(CHAT_CHARACTER_KEY, id);
}
