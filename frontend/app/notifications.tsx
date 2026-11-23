import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BarbellIcon from '@/assets/icons/ui/barbell.svg';
import ChatsIcon from '@/assets/icons/ui/chats-circle.svg';
import ForkKnifeIcon from '@/assets/icons/ui/fork-knife.svg';
import HeartbeatIcon from '@/assets/icons/ui/heartbeat.svg';
import TargetIcon from '@/assets/icons/ui/target.svg';
import { ASwitch } from '@/src/components/a/ASwitch';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { getApiErrorMessage } from '@/src/api/client';
import {
  getNotificationPreferences, saveNotificationPreferences, type NotificationPreferences,
} from '@/src/api/userSettings';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { aForm } from '@/src/components/a/form';
import { QUEST_NOTICES, questNoticeAvailable, readQuestNotice, setQuestNotice } from '@/src/features/a/questNotice';
import { Text, TextInput } from '@/src/components/common';

type ToggleKey = {
  key: keyof Pick<NotificationPreferences,
    'diet_enabled' | 'exercise_enabled' | 'health_report_enabled' | 'community_enabled' |
    'push_enabled' | 'foreground_push_enabled' | 'quiet_hours_enabled'>;
  label: string;
  detail: string;
};

const categories: ToggleKey[] = [
  { key: 'diet_enabled', label: '식단 알림', detail: '끼니 기록 · 영양 알림' },
  { key: 'exercise_enabled', label: '운동 알림', detail: '추천 · 목표 달성 알림' },
  { key: 'health_report_enabled', label: '건강 데이터 알림', detail: '새 자료를 올릴 때가 되면' },
  { key: 'community_enabled', label: '커뮤니티 알림', detail: '좋아요 · 댓글 · 팔로우' },
];

const categoryIcons: Partial<Record<ToggleKey['key'], typeof BarbellIcon>> = {
  diet_enabled: ForkKnifeIcon, exercise_enabled: BarbellIcon, health_report_enabled: HeartbeatIcon, community_enabled: ChatsIcon,
};

const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const shortTime = (value: string | null) => value?.slice(0, 5) ?? '';

export default function Notifications() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [start, setStart] = useState('23:00');
  const [end, setEnd] = useState('07:00');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [retry, setRetry] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    void getNotificationPreferences().then(({ preferences: value }) => {
      if (!active) return;
      setPreferences({ ...value,
        quiet_hours_start: shortTime(value.quiet_hours_start) || null,
        quiet_hours_end: shortTime(value.quiet_hours_end) || null,
      });
      setStart(shortTime(value.quiet_hours_start) || '23:00');
      setEnd(shortTime(value.quiet_hours_end) || '07:00');
      setError('');
    }).catch((cause) => {
      if (active) setError(getApiErrorMessage(cause));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // Retry replaces the focus callback after a failed request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retry]));

  // 퀘스트 알림 lives on the phone (src/features/a/questNotice.ts), not in the server's preferences
  const [questOn, setQuestOn] = useState(false);
  const [questBusy, setQuestBusy] = useState(false);
  const [questDenied, setQuestDenied] = useState(false);
  useFocusEffect(useCallback(() => {
    let live = true;
    void readQuestNotice().then((on) => { if (live) setQuestOn(on); });
    return () => { live = false; };
  }, []));
  const toggleQuest = () => {
    if (questBusy) return;
    setQuestBusy(true);
    void setQuestNotice(!questOn)
      .then((result) => { setQuestOn(result === 'on'); setQuestDenied(result === 'denied'); })
      .catch(() => setQuestOn(false))
      .finally(() => setQuestBusy(false));
  };
  const questTimes = QUEST_NOTICES.map((notice) => `${notice.hour > 12 ? `오후 ${notice.hour - 12}` : `오전 ${notice.hour}`}시`).join(' · ');

  const persist = async (next: NotificationPreferences) => {
    if (saving) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const response = await saveNotificationPreferences(next);
      setPreferences({ ...response.preferences,
        quiet_hours_start: shortTime(response.preferences.quiet_hours_start) || null,
        quiet_hours_end: shortTime(response.preferences.quiet_hours_end) || null,
      });
      setSaved(true);
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: ToggleKey['key']) => {
    if (!preferences) return;
    const next = { ...preferences, [key]: !preferences[key] };
    if (key === 'quiet_hours_enabled' && next.quiet_hours_enabled) {
      next.quiet_hours_start = validTime(start) ? start : '23:00';
      next.quiet_hours_end = validTime(end) ? end : '07:00';
    }
    void persist(next);
  };

  const saveHours = () => {
    if (!preferences) return;
    if (!validTime(start) || !validTime(end) || start === end) {
      setError('시작·종료 시간을 00:00~23:59 형식으로 다르게 입력해 주세요.');
      return;
    }
    void persist({ ...preferences, quiet_hours_start: start, quiet_hours_end: end });
  };

  const row = ({ key, label, detail }: ToggleKey, index: number) => {
    const Icon = categoryIcons[key];
    return (
    <View key={key} style={[styles.row, index > 0 && styles.rowLine]}>
      {Icon ? <Icon color={colors.textPrimary} height={24} width={24} /> : null}
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
      <ASwitch disabled={!preferences || saving} label={label} onChange={() => toggle(key)} value={preferences?.[key] ?? false} />
    </View>
  );
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader onBack={() => router.back()} title="알림" />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: 8, paddingBottom: insets.bottom + 32 }]}>
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? <Pressable accessibilityRole="button" onPress={() => setRetry((value) => value + 1)}><Text accessibilityRole="alert" style={styles.error}>{error} · 다시 시도하기</Text></Pressable> : null}
        {saved ? <Text accessibilityRole="alert" style={styles.saved}>설정을 저장했어요.</Text> : null}
        <Text style={styles.sectionTitle}>알림 종류</Text>
        <View style={styles.card}>
          {questNoticeAvailable ? (
            <View style={styles.row}>
              <TargetIcon color={colors.textPrimary} height={24} width={24} />
              <View style={styles.copy}>
                <Text style={styles.label}>퀘스트 알림</Text>
                <Text style={styles.detail}>{questDenied ? '휴대폰 설정에서 Auto-Fit 알림을 허용해 주세요' : `물 · 스트레칭 · 걸음 (${questTimes})`}</Text>
              </View>
              <ASwitch disabled={questBusy} label="퀘스트 알림" onChange={toggleQuest} value={questOn} />
            </View>
          ) : null}
          {categories.map((category, index) => row(category, questNoticeAvailable ? index + 1 : index))}
        </View>
        <Text style={styles.sectionTitle}>그 밖에</Text>
        <View style={styles.card}>
          {row({ key: 'quiet_hours_enabled', label: '방해 금지 시간', detail: `밤 ${start} ~ 아침 ${end}` }, 0)}
          {preferences?.quiet_hours_enabled ? (
            <View style={styles.timeRow}>
              <TextInput accessibilityLabel="방해 금지 시작 시간" keyboardType="numbers-and-punctuation" maxLength={5} onChangeText={setStart} placeholder="23:00" style={styles.timeInput} value={start} />
              <Text style={styles.detail}>~</Text>
              <TextInput accessibilityLabel="방해 금지 종료 시간" keyboardType="numbers-and-punctuation" maxLength={5} onChangeText={setEnd} placeholder="07:00" style={styles.timeInput} value={end} />
              <Pressable accessibilityRole="button" disabled={saving} onPress={saveHours} style={styles.timeSave}><Text style={styles.timeSaveText}>시간 저장</Text></Pressable>
            </View>
          ) : null}
          {row({ key: 'push_enabled', label: '푸시 알림', detail: '기기 알림 허용 시 받기' }, 1)}
          {row({ key: 'foreground_push_enabled', label: '앱 실행 중 알림', detail: '앱을 닫지 않아도 알림을 받기' }, 1)}
        </View>
        <Text style={styles.note}>기기 푸시 알림은 준비 중이에요. 고른 설정은 저장돼요.</Text>
      </ScrollView>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  // Renewal A: each kind a line in an outlined card, with the pixel switch.
  const a = aForm(colors);
  return {
    screen: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    content: { gap: 10, paddingHorizontal: 16 },
    sectionTitle: { ...a.q, marginBottom: 0, marginTop: 12, paddingHorizontal: 2 },
    card: { ...a.card, paddingHorizontal: 14 },
    row: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 66 },
    rowLine: { borderTopColor: colors.track, borderTopWidth: 2 },
    copy: { flex: 1, gap: 2 },
    label: { ...a.p15, color: colors.ink },
    detail: a.note,
    timeRow: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingBottom: 14 },
    timeInput: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 10, borderWidth: 1, color: colors.ink, fontFamily: fontFamilies.galmuri14, fontSize: 15, flex: 1, minWidth: 63, padding: 8, textAlign: 'center' },
    timeSave: a.mini,
    timeSaveText: a.miniText,
    note: a.note,
    error: { ...a.p12, color: colors.danger },
    saved: { ...a.p12, color: colors.success },
  } as const;
}
