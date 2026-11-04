import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import BarbellIcon from '@/assets/icons/ui/barbell.svg';
import CheckIcon from '@/assets/icons/ui/check.svg';
import FileIcon from '@/assets/icons/ui/file-text.svg';
import ForkKnifeIcon from '@/assets/icons/ui/fork-knife.svg';
import { getHabitTierProgress, type HabitTierProgress } from '@/src/api/tier';
import { getApiErrorMessage } from '@/src/api/client';
import { Text } from '@/src/components/common';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { SimpleReadButton } from '@/src/components/simple/SimpleReadButton';
import { useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';
import { nextTierName, tierBadges, tierColors, tierDescriptions, tierOrder } from '@/src/features/tier/tierBadges';
import { fontFamilies } from '@/src/theme';

// Points and limits come from the habit tier policy in the database.
const ways = [
  { title: '식단 관리', detail: '식사 기록 1번마다, 하루 3번까지', points: 2, Icon: ForkKnifeIcon, path: '/diet' as const },
  { title: '운동 관리', detail: '추천 운동 완료, 하루 1번', points: 5, Icon: BarbellIcon, path: '/exercise' as const },
  { title: '건강 데이터', detail: '검진 · 인바디 올리기, 한 달 1번', points: 15, Icon: FileIcon, path: '/health-data-management' as const },
];

export default function TierScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { preferences } = useDisplayPreferences();
  const simple = preferences.simple_mode_enabled;
  const [tier, setTier] = useState<HabitTierProgress | null>(null);
  const [tierError, setTierError] = useState('');
  const [tierLoading, setTierLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    void getHabitTierProgress().then(({ progress }) => {
      if (active) { setTier(progress); setTierError(''); }
    }).catch((cause) => {
      if (active) setTierError(getApiErrorMessage(cause));
    }).finally(() => {
      if (active) setTierLoading(false);
    });
    return () => { active = false; };
    // A retry replaces the focus callback and cancels its previous request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]));
  const code = tier?.tier_code ?? 'CORE';
  const Badge = tierBadges[code];
  const nextName = tier ? nextTierName(tier) : null;
  const tierRatio = tier
    ? tier.next_level_points === null
      ? 100
      : Math.max(0, Math.min(100, ((tier.points - tier.level_start_points) / Math.max(1, tier.next_level_points - tier.level_start_points)) * 100))
    : 0;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScreenHeader
        onBack={() => router.back()}
        right={<SimpleReadButton text={`내 티어 화면입니다. ${tier ? `현재 ${tier.tier_name} ${tier.sublevel}, 활동 점수 ${tier.points}점입니다.` : '티어 정보를 확인하고 있어요.'}`} />}
        title="내 티어"
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Badge height={120} width={120} />
          <Text style={[styles.heroTitle, simple && simpleStyles.heroTitle]}>{tier ? `${tier.tier_name} ${tier.sublevel}` : tierLoading ? '티어를 불러오는 중…' : '티어를 확인할 수 없어요'}</Text>
          {tier ? <Text style={styles.heroDescription}>{tierDescriptions[code]}</Text> : null}
        </View>
        {tierError ? (
          <Pressable accessibilityRole="button" onPress={() => { setTierLoading(true); setAttempt((value) => value + 1); }} style={styles.tierError}>
            <Text style={styles.tierErrorText}>티어 조회가 지연되고 있어요. 다시 시도하기</Text>
          </Pressable>
        ) : null}
        {tier ? (
          <View style={[styles.card, styles.pointsCard, simple && simpleStyles.card]}>
            <View style={styles.spread}>
              <Text style={styles.points}>
                {tier.points.toLocaleString()}점
                {nextName ? <Text style={styles.muted}>  / {nextName} · {tier.next_level_points?.toLocaleString()}점부터</Text> : null}
              </Text>
              <Text style={styles.left}>{tier.next_level_points === null ? '가장 높은 단계' : `${Math.max(0, tier.next_level_points - tier.points).toLocaleString()}점 남음`}</Text>
            </View>
            <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: tierRatio }} style={styles.track}>
              <View style={[styles.fill, { backgroundColor: tierColors[code], width: `${tierRatio}%` }]} />
            </View>
            <View style={styles.spread}>
              <Text style={styles.muted}>{tier.tier_name} {tier.sublevel} · {tier.level_start_points.toLocaleString()}점</Text>
              {nextName ? <Text style={styles.muted}>{nextName} · {tier.next_level_points?.toLocaleString()}점</Text> : null}
            </View>
          </View>
        ) : null}

        <Text style={[styles.sectionTitle, simple && simpleStyles.sectionTitle]}>이렇게 올려 보세요</Text>
        <View style={styles.card}>
          {ways.map(({ title, detail, points, Icon, path }, index) => (
            <Pressable hitSlop={8} key={title} accessibilityRole="button" onPress={() => router.push(path)} style={[styles.way, simple && simpleStyles.way, index > 0 && styles.wayDivider]}>
              <View style={styles.wayIcon}><Icon color="#17161D" height={22} width={22} /></View>
              <View style={styles.wayCopy}>
                <Text style={[styles.wayTitle, simple && simpleStyles.wayTitle]}>{title}</Text>
                <Text style={styles.muted}>{detail}</Text>
              </View>
              <View style={styles.pill}>
                <CheckIcon color="#0E7C48" height={14} width={14} />
                <Text style={styles.pillText}>+{points}점</Text>
              </View>
              <CaretRightIcon color="#5E5D66" height={20} width={20} />
            </Pressable>
          ))}
        </View>

        <Text style={[styles.sectionTitle, simple && simpleStyles.sectionTitle]}>티어 단계</Text>
        <View style={[styles.card, styles.steps]}>
          <View style={styles.stepRow}>
            {tierOrder.map((name) => {
              const StepBadge = tierBadges[name];
              const current = name === tier?.tier_code;
              const size = current ? 56 : 40;
              return (
                <View key={name} style={styles.step}>
                  <StepBadge height={size} width={size} />
                  <Text numberOfLines={1} style={[styles.stepName, current && { color: tierColors[name] }]}>{name}</Text>
                  {current ? <Text style={styles.now}>지금</Text> : null}
                </View>
              );
            })}
          </View>
          <Text style={styles.muted}>CORE부터 PEAK까지, 티어마다 3단계씩 올라가요.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#FFFFFF', flex: 1 },
  content: { alignSelf: 'center', maxWidth: 412, paddingHorizontal: 20, width: '100%' },
  hero: { alignItems: 'center', paddingTop: 8 },
  heroTitle: { color: '#17161D', fontFamily: fontFamilies.pretendardBold, fontSize: 32, lineHeight: 42, marginTop: 8 },
  heroDescription: { color: '#3B3A42', fontSize: 16, lineHeight: 24, marginTop: 2, textAlign: 'center' },
  tierError: { backgroundColor: '#FFF4F4', borderRadius: 12, marginTop: 16, padding: 12 },
  tierErrorText: { color: '#B34141', fontSize: 14 },
  card: { backgroundColor: '#FAFBFC', borderColor: '#DFE2E7', borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  pointsCard: { gap: 10, marginTop: 24, padding: 18 },
  spread: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'space-between' },
  points: { color: '#17161D', fontFamily: fontFamilies.pretendardBold, fontSize: 18, lineHeight: 26 },
  left: { color: '#17161D', fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
  muted: { color: '#5E5D66', fontFamily: fontFamilies.pretendardRegular, fontSize: 14, lineHeight: 21 },
  track: { backgroundColor: '#E3E6EB', borderRadius: 4, height: 8, overflow: 'hidden' },
  fill: { borderRadius: 4, height: 8 },
  sectionTitle: { color: '#17161D', fontFamily: fontFamilies.pretendardBold, fontSize: 18, lineHeight: 26, marginBottom: 12, marginTop: 24 },
  way: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 80, paddingHorizontal: 16, paddingVertical: 10 },
  wayDivider: { borderTopColor: '#DFE2E7', borderTopWidth: 1 },
  wayIcon: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  wayCopy: { flex: 1, gap: 2, minWidth: 0 },
  wayTitle: { color: '#17161D', fontFamily: fontFamilies.pretendardBold, fontSize: 16, lineHeight: 24 },
  pill: { alignItems: 'center', backgroundColor: '#E8F6EF', borderRadius: 999, flexDirection: 'row', gap: 4, height: 26, paddingHorizontal: 8 },
  pillText: { color: '#0E7C48', fontFamily: fontFamilies.pretendardMedium, fontSize: 12 },
  steps: { gap: 16, padding: 18 },
  stepRow: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between' },
  step: { alignItems: 'center', flex: 1, gap: 4 },
  stepName: { color: '#5E5D66', fontFamily: fontFamilies.pretendardMedium, fontSize: 12 },
  now: { color: '#17161D', fontFamily: fontFamilies.pretendardBold, fontSize: 12 },
});

const simpleStyles = StyleSheet.create({
  heroTitle: { fontSize: 36 },
  card: { padding: 20 },
  sectionTitle: { fontSize: 20 },
  way: { minHeight: 96 },
  wayTitle: { fontSize: 18 },
});
