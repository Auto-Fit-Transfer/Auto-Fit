import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getHome } from '@/src/api/home';
import { Text } from '@/src/components/common';
import { HealthScore, HomeGreeting, WeeklyProgressCard } from '@/src/components/home';
import {
  BOTTOM_NAVIGATION_MIN_BOTTOM_GAP,
  getBottomNavigationVisualHeight,
} from '@/src/components/navigation';
import { colors } from '@/src/theme';
import { getSupabaseClient } from '@/src/lib/supabase';

import { MainGradient } from '@/src/components/main/MainSurface';
import { StatusBar } from 'expo-status-bar';

const referenceWidth = 412;
const referenceScreenHeight = 917;
const referenceGreetingTop = 38;
const referenceHealthScoreTop = 268;
const referenceHealthScoreSize = 350;
const referenceGraphCardGap = 22;
const referenceWeeklyProgressHeight = 70;
const referenceCardToNavigationGap = 129;
const minimumVerticalPositionScale = 0.86;

const greetingMessage = '오늘도 당신의 건강한 변화를 응원해요!';
const fallbackUserName = '회원';

type ApiRecord = Record<string, unknown>;

type HomeHealthScore = {
  score: number | null;
  totalScore: number | null;
};

type HomeWeeklyProgress = {
  change: number | null;
  message: string | null;
};

type HomeLoadState = 'error' | 'loading' | 'ready';

function isApiRecord(value: unknown): value is ApiRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(record: ApiRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

async function getSessionUserName() {
  try {
    const {
      data: { session },
    } = await getSupabaseClient().auth.getSession();

    const metadata = session?.user?.user_metadata;
    if (!isApiRecord(metadata)) return undefined;
    return readString(metadata, ['full_name', 'name']);
  } catch {
    return undefined;
  }
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [healthScore, setHealthScore] = useState<HomeHealthScore | null>(null);
  const [loadState, setLoadState] = useState<HomeLoadState>('loading');
  const [userName, setUserName] = useState(fallbackUserName);
  const [weeklyProgress, setWeeklyProgress] = useState<HomeWeeklyProgress | null>(null);
  const isMountedRef = useRef(true);
  const requestInFlightRef = useRef(false);

  const loadHomeData = useCallback(async () => {
    if (requestInFlightRef.current) return;

    requestInFlightRef.current = true;
    setLoadState('loading');

    try {
      const response = await getHome();
      if (!isMountedRef.current) return;

      const apiUserName = response.user_name.trim();
      setHealthScore({
        score: response.health_score.score,
        totalScore: response.health_score.total_score,
      });
      setWeeklyProgress({
        change: response.score_change.change,
        message: response.score_change.message,
      });
      setUserName(apiUserName || fallbackUserName);
      setLoadState('ready');

      if (!apiUserName) {
        void getSessionUserName().then((sessionUserName) => {
          if (isMountedRef.current && sessionUserName) setUserName(sessionUserName);
        });
      }
    } catch (error) {
      if (!isMountedRef.current) return;

      console.error('Home request failed:', error);
      setHealthScore(null);
      setWeeklyProgress(null);
      setUserName(fallbackUserName);
      setLoadState('error');

      void getSessionUserName().then((sessionUserName) => {
        if (isMountedRef.current && sessionUserName) setUserName(sessionUserName);
      });
    } finally {
      requestInFlightRef.current = false;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      isMountedRef.current = true;
      const frame = requestAnimationFrame(() => {
        void loadHomeData();
      });

      return () => {
        isMountedRef.current = false;
        cancelAnimationFrame(frame);
      };
    }, [loadHomeData]),
  );

  const bottomNavigationVisualHeight = getBottomNavigationVisualHeight(windowHeight);
  const bottomClearance = Math.max(insets.bottom, BOTTOM_NAVIGATION_MIN_BOTTOM_GAP);
  const availableWidth = Math.max(0, windowWidth - insets.left - insets.right);
  const widthScale = Math.min(1, availableWidth / referenceWidth);
  const scaledWidth = referenceWidth * widthScale;
  const bottomNavigationTop = windowHeight - bottomClearance - bottomNavigationVisualHeight;
  const graphSectionHeight =
    referenceHealthScoreSize + referenceGraphCardGap + referenceWeeklyProgressHeight;
  const maximumGraphSectionTop =
    bottomNavigationTop / widthScale - graphSectionHeight - referenceCardToNavigationGap;
  const graphSectionTop = Math.max(
    referenceHealthScoreTop * minimumVerticalPositionScale,
    Math.min(referenceHealthScoreTop, maximumGraphSectionTop),
  );
  const verticalPositionScale = graphSectionTop / referenceHealthScoreTop;
  const canvasTop = Math.max(
    0,
    insets.top - referenceGreetingTop * verticalPositionScale * widthScale,
  );
  const canvasLeft = insets.left + (availableWidth - scaledWidth) / 2;
  const openTotalAnalysis = useCallback(() => {
    router.push({ pathname: '/total-analysis', params: { source: 'home' } });
  }, [router]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={{ height: 140 + Math.max(0, insets.top - 28), backgroundColor: colors.dark }}>
        <MainGradient />
        <HomeGreeting
          message={greetingMessage}
          userName={userName}
          style={{ marginTop: Math.max(38, insets.top + 10), marginHorizontal: 20, width: 'auto' }}
        />
      </View>

      <View
        style={[
          styles.designCanvas,
          {
            left: canvasLeft,
            top: canvasTop,
            transform: [{ scale: widthScale }],
          },
        ]}
      >
        <View style={[styles.scoreSection, { top: graphSectionTop }]}>
          {loadState === 'loading' && !healthScore ? (
            <HomeDataPlaceholder style={styles.scorePlaceholder} />
          ) : (
            <View style={styles.healthScorePressable}>
              <HealthScore
                score={healthScore?.score ?? null}
                status={null}
                onTierPress={() => router.push('/tier')}
                onScorePress={openTotalAnalysis}
                totalScore={healthScore?.totalScore ?? null}
              />
            </View>
          )}
          {loadState === 'loading' && !weeklyProgress ? (
            <HomeDataPlaceholder compact style={styles.weeklyProgress} />
          ) : (
            <WeeklyProgressCard
              onPress={openTotalAnalysis}
              change={weeklyProgress?.change ?? null}
              message={weeklyProgress?.message ?? null}
              style={styles.weeklyProgress}
            />
          )}
        </View>
      </View>
    </View>
  );
}

function HomeDataPlaceholder({ compact = false, style }: { compact?: boolean; style?: object }) {
  return (
    <View style={[compact ? styles.weeklyPlaceholder : styles.scorePlaceholder, style]}>
      <Text style={styles.placeholderText}>건강 정보를 불러오는 중이에요.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.backgroundPurple,
    flex: 1,
    overflow: 'hidden',
  },
  background: {
    left: 0,
    position: 'absolute',
    top: 0,
    width: '100%',
  },
  designCanvas: {
    height: referenceScreenHeight,
    position: 'absolute',
    transformOrigin: 'top left',
    width: referenceWidth,
  },
  greeting: {
    left: 21,
    position: 'absolute',
  },
  scoreSection: {
    left: 31,
    position: 'absolute',
  },
  weeklyProgress: {
    alignSelf: 'center',
    marginTop: referenceGraphCardGap,
  },
  healthScorePressable: { height: referenceHealthScoreSize, width: referenceHealthScoreSize },
  scorePlaceholder: {
    alignItems: 'center',
    height: referenceHealthScoreSize,
    justifyContent: 'center',
    width: referenceHealthScoreSize,
  },
  weeklyPlaceholder: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    height: referenceWeeklyProgressHeight,
    justifyContent: 'center',
    width: 300,
  },
  placeholderText: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
});
