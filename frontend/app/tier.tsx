import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getHome, type HomeResponse } from '@/src/api/home';
import { getHabitTierProgress, type HabitTierProgress } from '@/src/api/tier';
import { getApiErrorMessage } from '@/src/api/client';
import { SimpleReadButton } from '@/src/components/simple/SimpleReadButton';
import { useDisplayPreferences } from '@/src/features/settings/DisplayPreferencesContext';
import { fontFamilies } from '@/src/theme';
import DietIcon from '@/assets/figma/main/8f046.svg';
import ExerciseIcon from '@/assets/figma/main/3a625.svg';
import DataIcon from '@/assets/figma/main/baa81.svg';
import CoreIcon from '@/assets/figma/main/6a991.svg';
import BalanceIcon from '@/assets/figma/main/e036c.svg';
import ActiveIcon from '@/assets/figma/main/6ebab.svg';
import FitIcon from '@/assets/figma/main/2ad06.svg';
import PeakIcon from '@/assets/figma/main/5ef63.svg';

const roadmap = [
  { name: 'CORE', description: '관리 시작', Icon: CoreIcon },
  { name: 'BALANCE', description: '균형 잡기', Icon: BalanceIcon },
  { name: 'ACTIVE', description: '꾸준한 실천', Icon: ActiveIcon },
  { name: 'FIT', description: '습관 안정화', Icon: FitIcon },
  { name: 'PEAK', description: '건강 흐름 유지', Icon: PeakIcon },
];

export default function TierScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { preferences } = useDisplayPreferences();
  const simple = preferences.simple_mode_enabled;
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [tier, setTier] = useState<HabitTierProgress | null>(null);
  const [tierError, setTierError] = useState('');
  const [tierLoading, setTierLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    void getHome().then((response) => {
      if (active) setHome(response);
    }).catch(() => {
      if (active) setHome(null);
    });
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
  const score = home?.health_score.score;
  const total = home?.health_score.total_score;
  const ratio = score != null && total && total > 0 ? Math.max(0, Math.min(100, (score / total) * 100)) : 0;
  const tierRatio = tier
    ? tier.next_level_points === null
      ? 100
      : Math.max(0, Math.min(100, ((tier.points - tier.level_start_points) / Math.max(1, tier.next_level_points - tier.level_start_points)) * 100))
    : 0;
  const CurrentIcon = roadmap.find((stage) => stage.name === tier?.tier_code)?.Icon ?? CoreIcon;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable accessibilityLabel="뒤로 가기" accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>내 티어</Text>
        <View style={styles.read}><SimpleReadButton text={`내 티어 화면입니다. ${tier ? `현재 ${tier.tier_name} ${tier.sublevel}, 누적 활동 점수 ${tier.points}점입니다.` : '티어 정보를 확인하고 있어요.'} 현재 건강 점수는 ${score ?? '정보 없음'}점입니다.`} /></View>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}><CurrentIcon /></View>
          <Text style={[styles.heroTitle, simple && simpleStyles.heroTitle]}>{tier ? tier.tier_name + ' ' + tier.sublevel : tierLoading ? '티어를 불러오는 중…' : '티어를 확인할 수 없어요'}</Text>
          <Text style={styles.heroDescription}>기록하고 완료한 건강관리 활동으로 쌓이는 티어예요.</Text>
        </View>
        {tierError ? (
          <Pressable accessibilityRole="button" onPress={() => { setTierLoading(true); setAttempt((value) => value + 1); }} style={styles.tierError}>
            <Text style={styles.tierErrorText}>티어 조회가 지연되고 있어요. 다시 시도하기</Text>
          </Pressable>
        ) : null}
        {tier ? (
          <View style={[styles.pointsCard, simple && simpleStyles.card]}>
            <View style={styles.scoreHeading}>
              <Text style={styles.scoreLabel}>누적 활동 점수</Text>
              <Text style={styles.scoreValue}>{tier.points.toLocaleString()}<Text style={styles.scoreTotal}> P</Text></Text>
            </View>
            <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: tierRatio }} style={styles.track}>
              <View style={[styles.fill, { width: `${tierRatio}%` }]} />
            </View>
            <Text style={styles.scoreNote}>{tier.next_level_points === null ? '현재 최고 단계예요.' : '다음 단계까지 ' + Math.max(0, tier.next_level_points - tier.points).toLocaleString() + 'P 남았어요.'}</Text>
          </View>
        ) : null}

        <View style={[styles.scoreCard, simple && simpleStyles.card]}>
          <View style={styles.scoreHeading}>
            <Text style={styles.scoreLabel}>현재 건강 점수</Text>
            <Text style={styles.scoreValue}>{score ?? '—'}<Text style={styles.scoreTotal}> / {total ?? '—'}점</Text></Text>
          </View>
          <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: ratio }} style={styles.track}>
            <View style={[styles.fill, { width: `${ratio}%` }]} />
          </View>
          <Text style={styles.scoreNote}>건강 점수는 활동 점수·마일리지와 별도로 계산돼요.</Text>
        </View>

        <Text style={[styles.sectionTitle, simple && simpleStyles.sectionTitle]}>이번 주 이렇게 관리해 보세요</Text>
        <View style={styles.missions}>
          {[
            { title: '식단 관리', description: '식사를 기록하고 영양 상태를 확인해요', Icon: DietIcon, path: '/diet' as const },
            { title: '운동 관리', description: '나에게 맞는 운동을 꾸준히 실천해요', Icon: ExerciseIcon, path: '/exercise' as const },
            { title: '건강 데이터', description: '최신 건강검진·인바디 자료를 관리해요', Icon: DataIcon, path: '/health-data-management' as const },
          ].map(({ title, description, Icon, path }) => (
            <Pressable key={title} accessibilityRole="button" onPress={() => router.push(path)} style={[styles.mission, simple && simpleStyles.mission]}>
              <View style={styles.missionIcon}><Icon /></View>
              <View style={styles.missionCopy}>
                <Text style={[styles.missionTitle, simple && simpleStyles.missionTitle]}>{title}</Text>
                <Text style={styles.missionDescription}>{description}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.sectionTitle, simple && simpleStyles.sectionTitle]}>건강 티어 로드맵</Text>
        <Text style={styles.roadmapNote}>CORE부터 PEAK까지 3단계씩 올라가요. 현재 단계는 강조했어요.</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roadmap}>
          {roadmap.map(({ name, description, Icon }) => (
            <View key={name} style={[styles.stage, tier?.tier_code === name && styles.currentStage]}>
              <View style={styles.stageIcon}><Icon /></View>
              <Text style={styles.stageTitle}>{name}</Text>
              <Text style={styles.stageDescription}>{description}</Text>
            </View>
          ))}
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#FFFFFF', flex: 1 },
  header: { alignItems: 'center', justifyContent: 'center', minHeight: 62, paddingHorizontal: 20 },
  read: { position: 'absolute', right: 20, bottom: 7 },
  back: { bottom: 7, height: 42, justifyContent: 'center', left: 20, position: 'absolute', width: 42, zIndex: 1 },
  backText: { color: '#27262D', fontSize: 32, lineHeight: 38 },
  headerTitle: { color: '#27262D', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 16 },
  content: { alignSelf: 'center', maxWidth: 412, paddingHorizontal: 20, width: '100%' },
  hero: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 28 },
  heroIcon: { alignItems: 'center', backgroundColor: '#F3F0FF', borderRadius: 42, height: 84, justifyContent: 'center', width: 84 },
  heroTitle: { color: '#322D43', fontFamily: fontFamilies.pretendardBold, fontSize: 23, marginTop: 17 },
  heroDescription: { color: '#98939F', fontSize: 12, lineHeight: 19, marginTop: 8, textAlign: 'center' },
  tierError: { backgroundColor: '#FFF4F4', borderRadius: 9, marginTop: 18, padding: 12 },
  tierErrorText: { color: '#B34141', fontSize: 12 },
  pointsCard: { borderColor: '#E9E6F1', borderRadius: 17, borderWidth: 1, gap: 12, marginTop: 25, padding: 17 },
  scoreCard: { borderColor: '#E9E6F1', borderRadius: 17, borderWidth: 1, gap: 12, marginTop: 30, padding: 17 },
  scoreHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  scoreLabel: { color: '#696472', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 13 },
  scoreValue: { color: '#6551D2', fontFamily: fontFamilies.pretendardBold, fontSize: 21 },
  scoreTotal: { color: '#9A96A2', fontFamily: fontFamilies.pretendardRegular, fontSize: 11 },
  track: { backgroundColor: '#EAE5F8', borderRadius: 4, height: 7, overflow: 'hidden' },
  fill: { backgroundColor: '#7762DB', borderRadius: 4, height: 7 },
  scoreNote: { color: '#96919E', fontSize: 11, lineHeight: 17 },
  sectionTitle: { color: '#333039', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 17, marginBottom: 11, marginTop: 29 },
  missions: { borderColor: '#EAE9EE', borderRadius: 15, borderWidth: 1, overflow: 'hidden' },
  mission: { alignItems: 'center', borderBottomColor: '#F1F0F4', borderBottomWidth: 1, flexDirection: 'row', gap: 12, minHeight: 67, paddingHorizontal: 13 },
  missionIcon: { alignItems: 'center', backgroundColor: '#F3F0FD', borderRadius: 11, height: 38, justifyContent: 'center', width: 38 },
  missionCopy: { flex: 1, gap: 4 },
  missionTitle: { color: '#3C3844', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 13 },
  missionDescription: { color: '#9A96A1', fontSize: 10 },
  chevron: { color: '#9A96A1', fontSize: 22 },
  roadmapNote: { color: '#9995A0', fontSize: 11, marginTop: -3 },
  roadmap: { gap: 9, paddingBottom: 8, paddingTop: 14 },
  stage: { alignItems: 'center', backgroundColor: '#F8F7FB', borderRadius: 13, minHeight: 123, padding: 12, width: 112 },
  currentStage: { borderColor: '#7866F4', borderWidth: 2 },
  stageIcon: { alignItems: 'center', height: 49, justifyContent: 'center' },
  stageTitle: { color: '#6555B7', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 12, marginTop: 3 },
  stageDescription: { color: '#938F9B', fontSize: 10, marginTop: 5, textAlign: 'center' },
});

const simpleStyles = StyleSheet.create({
  heroTitle: { fontSize: 29 },
  card: { padding: 20 },
  sectionTitle: { fontSize: 20 },
  mission: { minHeight: 84 },
  missionTitle: { fontSize: 17 },
});
