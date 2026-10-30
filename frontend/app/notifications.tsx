import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import Back from '@/assets/figma/main/a08ac.svg';
import { getApiErrorMessage } from '@/src/api/client';
import {
  getNotificationPreferences, saveNotificationPreferences, type NotificationPreferences,
} from '@/src/api/userSettings';
import { colors, fontFamilies } from '@/src/theme';

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
  { key: 'community_enabled', label: '커뮤니티 알림', detail: '좋아요 · 댓글 · 팔로우 · 서버 반영 예정' },
];

const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const shortTime = (value: string | null) => value?.slice(0, 5) ?? '';

export default function Notifications() {
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

  const row = ({ key, label, detail }: ToggleKey) => (
    <View key={key} style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
      <Switch
        accessibilityLabel={label}
        disabled={!preferences || saving}
        onValueChange={() => toggle(key)}
        trackColor={{ false: '#92929A', true: colors.primaryDark }}
        value={preferences?.[key] ?? false}
      />
    </View>
  );

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }]}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()} style={styles.back}><Back /></Pressable>
          <Text style={styles.title}>알림 설정</Text>
          <View style={styles.back} />
        </View>
        {loading ? <ActivityIndicator color={colors.primaryDark} /> : null}
        {error ? <Pressable accessibilityRole="button" onPress={() => setRetry((value) => value + 1)}><Text accessibilityRole="alert" style={styles.error}>{error} · 다시 시도하기</Text></Pressable> : null}
        {saved ? <Text accessibilityRole="alert" style={styles.saved}>설정을 저장했어요.</Text> : null}
        <Text style={styles.sectionTitle}>알림 종류</Text>
        <View style={styles.card}>{categories.map(row)}</View>
        <Text style={styles.sectionTitle}>그 밖에</Text>
        <View style={styles.card}>
          {row({ key: 'quiet_hours_enabled', label: '방해 금지 시간', detail: `밤 ${start} ~ 아침 ${end}` })}
          {preferences?.quiet_hours_enabled ? (
            <View style={styles.timeRow}>
              <TextInput accessibilityLabel="방해 금지 시작 시간" keyboardType="numbers-and-punctuation" maxLength={5} onChangeText={setStart} placeholder="23:00" style={styles.timeInput} value={start} />
              <Text style={styles.detail}>~</Text>
              <TextInput accessibilityLabel="방해 금지 종료 시간" keyboardType="numbers-and-punctuation" maxLength={5} onChangeText={setEnd} placeholder="07:00" style={styles.timeInput} value={end} />
              <Pressable accessibilityRole="button" disabled={saving} onPress={saveHours} style={styles.timeSave}><Text style={styles.timeSaveText}>시간 저장</Text></Pressable>
            </View>
          ) : null}
          {row({ key: 'push_enabled', label: '푸시 알림', detail: '기기 알림 허용 시 받기' })}
          {row({ key: 'foreground_push_enabled', label: '앱 실행 중 알림', detail: '앱을 닫지 않아도 알림을 받기' })}
        </View>
        <Text style={styles.note}>알림 수신 설정이 저장됩니다. 기기 푸시 전송은 서버 알림 서비스가 연결된 뒤 동작해요.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 22, gap: 15 },
  header: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  back: { width: 32, minHeight: 32, justifyContent: 'center' },
  title: { fontFamily: fontFamilies.pretendardSemiBold, fontSize: 17, color: colors.textPrimary },
  sectionTitle: { fontSize: 16, color: colors.textPrimary, fontFamily: fontFamilies.pretendardSemiBold, marginTop: 13 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 16 },
  row: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  copy: { flex: 1, gap: 4 },
  label: { fontSize: 14, color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium },
  detail: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  timeInput: { flex: 1, minWidth: 63, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 8, color: colors.textPrimary, textAlign: 'center' },
  timeSave: { padding: 9, borderRadius: 8, backgroundColor: colors.primaryDark },
  timeSaveText: { color: colors.surface, fontSize: 11 },
  note: { color: colors.textSecondary, fontSize: 12, lineHeight: 19 },
  error: { color: colors.danger, fontSize: 12 },
  saved: { color: colors.success, fontSize: 12 },
});
