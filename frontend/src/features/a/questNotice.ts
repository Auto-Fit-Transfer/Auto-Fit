import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

// Renewal A's 퀘스트 알림 (a-me.html: "물 · 산책 · 스트레칭 할 때가 되면"). The server has no quest notices, so the
// phone keeps the switch and schedules them itself.
// shortcut: three fixed times a day, sent even when that quest is already done; move to the server once it
// keeps the quests (back-end quest contract) and can send only what is still to do.
const KEY = 'auto-fit.a.quest-notice.v1';
const CHANNEL = 'quests';
export const QUEST_NOTICES = [
  { id: 'quest-water', hour: 13, minute: 0, title: '물 퀘스트', body: '물 한 잔 마실 때예요.' },
  { id: 'quest-stretch', hour: 16, minute: 0, title: '스트레칭 퀘스트', body: '잠깐 일어나서 몸을 풀어 볼까요?' },
  { id: 'quest-walk', hour: 20, minute: 0, title: '걸음 퀘스트', body: '오늘 걸음 퀘스트를 확인해 보세요.' },
] as const;

// Local notices need a phone: the web preview has none.
export const questNoticeAvailable = Platform.OS === 'ios' || Platform.OS === 'android';

export async function readQuestNotice() {
  try {
    return (await AsyncStorage.getItem(KEY)) === 'on';
  } catch {
    return false;
  }
}

// On: ask once for permission, then schedule the three daily notices. Off: take them away.
export async function setQuestNotice(on: boolean): Promise<'on' | 'off' | 'denied'> {
  if (!questNoticeAvailable) return 'off';
  await Promise.all(QUEST_NOTICES.map((notice) => Notifications.cancelScheduledNotificationAsync(notice.id).catch(() => undefined)));
  if (!on) {
    await AsyncStorage.setItem(KEY, 'off');
    return 'off';
  }
  const now = await Notifications.getPermissionsAsync();
  const granted = now.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) {
    await AsyncStorage.setItem(KEY, 'off');
    return 'denied';
  }
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, { importance: AndroidImportance.DEFAULT, name: '퀘스트 알림' });
  }
  for (const notice of QUEST_NOTICES) {
    await Notifications.scheduleNotificationAsync({
      content: { body: notice.body, title: notice.title },
      identifier: notice.id,
      trigger: { channelId: CHANNEL, hour: notice.hour, minute: notice.minute, type: Notifications.SchedulableTriggerInputTypes.DAILY },
    });
  }
  await AsyncStorage.setItem(KEY, 'on');
  return 'on';
}
