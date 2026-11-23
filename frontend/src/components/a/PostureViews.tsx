import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CheckIcon from '@/assets/icons/system/Check.svg';
import { AppBottomSheet, Text } from '@/src/components/common';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { ALoading } from './ALoading';
import { aForm } from './form';
import { KindsBar } from './RunParts';
import { Headline } from '@/src/components/b/Headline';

// 자세 분석 in renewal B's way (b-posture.html), the three screens as views that only show what they are given
// (the screens under app/exercise fill them): filming, waiting for the analysis, and the result. No red anywhere:
// recording is the violet of "now", a score under the mark is plain black, an angle outside its range is bold.

// ---------- 1. filming: put my body in the frame and film ten seconds ----------
// The camera is the screen. Which exercise is on top of it, what to check before filming is a box.
export function PostureShootView({
  kinds,
  exercises,
  selected,
  chipsOff,
  camera,
  lie,
  frameLabel,
  phase,
  seconds,
  total,
  cover,
  hint,
  canStart,
  onBack,
  onSelect,
  onAlbum,
  onStart,
  onStop,
  onRetake,
  onAnalyze,
  onTips,
}: {
  kinds: { label: string; selected?: boolean; onPress: () => void }[];
  // The exercises that can be analysed; null while they are being asked for.
  exercises: string[] | null;
  selected: number;
  chipsOff: boolean;
  // The live camera picture, or nothing (no permission, the web, or a finished take).
  camera: ReactNode;
  // The body lies across the picture (push-up, plank), so the frame does too.
  lie: boolean;
  frameLabel: string;
  phase: 'idle' | 'recording' | 'review';
  seconds: number;
  total: number;
  // Words over the camera in place of the frame: a finished take, or why there is no camera.
  cover: { title: string; lines: string[]; action?: { label: string; onPress: () => void } } | null;
  hint: string;
  canStart: boolean;
  onBack: () => void;
  onSelect: (index: number) => void;
  onAlbum: () => void;
  onStart: () => void;
  onStop: () => void;
  onRetake: () => void;
  onAnalyze: () => void;
  onTips: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, styles.shoot, { paddingBottom: Math.max(12, insets.bottom), paddingTop: insets.top + 16 }]}>
      <KindsBar kinds={kinds} onBack={onBack} title="자세 분석" />
      {exercises && exercises.length > 0 ? (
        <View style={styles.chips}>
          {exercises.map((name, index) => (
            <Pressable
              key={name}
              accessibilityRole="radio"
              accessibilityState={{ checked: index === selected, disabled: chipsOff }}
              disabled={chipsOff}
              onPress={() => onSelect(index)}
              style={[styles.chip, index === selected && styles.on]}
            >
              <Text numberOfLines={1} style={[styles.chipText, index === selected && styles.onText]}>
                {name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.cam}>
        {camera}
        {cover ? (
          <View style={styles.cover}>
            <Text accessibilityRole="header" style={styles.coverTitle}>
              {cover.title}
            </Text>
            {cover.lines.map((line) => (
              <Text key={line} style={styles.coverText}>
                {line}
              </Text>
            ))}
            {cover.action ? (
              <Pressable accessibilityRole="button" onPress={cover.action.onPress} style={({ pressed }) => [styles.go, styles.coverGo, pressed && styles.goPressed]}>
                <Text style={styles.goSmall}>{cover.action.label}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <>
            <View pointerEvents="none" style={[styles.guide, lie ? styles.guideLie : styles.guideStand]} />
            <Text style={[styles.frameLabel, lie ? styles.frameLabelLie : styles.frameLabelStand]}>{frameLabel}</Text>
          </>
        )}
        {phase === 'recording' ? (
          <>
            {/* the lilac line fills as the ten seconds go; the violet dot of "now" says it is recording */}
            <View style={[styles.took, { width: `${Math.min(100, (seconds / total) * 100)}%` }]} />
            <View style={styles.state}>
              <View style={styles.stateDot} />
              <Text style={styles.stateText}>
                녹화 중 {String(seconds).padStart(2, '0')} / {total}초
              </Text>
            </View>
          </>
        ) : null}
      </View>

      <Text style={[styles.note, styles.hint]}>{hint}</Text>
      {phase === 'review' ? (
        <View style={styles.ctl}>
          <Pressable accessibilityRole="button" onPress={onRetake} style={({ pressed }) => [styles.go, styles.ghost, styles.half, pressed && styles.goPressed]}>
            <Text style={styles.goText}>다시 찍기</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onAnalyze} style={({ pressed }) => [styles.go, styles.half, pressed && styles.goPressed]}>
            <Text style={styles.goText}>분석하기</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.ctl}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: phase === 'recording' }}
            disabled={phase === 'recording'}
            onPress={onAlbum}
            style={({ pressed }) => [styles.go, styles.ghost, styles.album, phase === 'recording' && styles.off, pressed && styles.goPressed]}
          >
            <Text style={styles.goText}>앨범</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={phase === 'recording' ? '녹화 멈추기' : '자세 촬영 시작'}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canStart }}
            disabled={!canStart}
            onPress={phase === 'recording' ? onStop : onStart}
            style={({ pressed }) => [styles.go, styles.half, !canStart && styles.off, pressed && styles.goPressed]}
          >
            <Text style={styles.goText}>{phase === 'recording' ? '멈추기' : '촬영 시작'}</Text>
          </Pressable>
        </View>
      )}
      <Pressable accessibilityRole="button" hitSlop={8} onPress={onTips} style={styles.under}>
        <Text style={styles.link}>촬영 전에 확인할 것</Text>
      </Pressable>
    </View>
  );
}

// The box of what to check before filming: the lines the server sends for the exercise.
export function PostureTips({
  visible,
  lines,
  limits,
  onClose,
}: {
  visible: boolean;
  lines: string[];
  limits: string[];
  onClose: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const row = (line: string) => (
    <View key={line} style={styles.bulletRow}>
      <View style={styles.bullet} />
      <Text style={[styles.words, styles.grow]}>{line}</Text>
    </View>
  );
  return (
    <AppBottomSheet contentStyle={styles.sheet} onClose={onClose} title="촬영 전에 확인할 것" visible={visible}>
      {lines.map(row)}
      {row('영상은 분석에만 쓰고, 분석이 끝나면 서버에서 바로 지워요.')}
      {limits.length > 0 ? (
        <>
          <Text style={[styles.q, styles.sheetQ]}>이런 점은 정확하지 않을 수 있어요</Text>
          {limits.map(row)}
        </>
      ) : null}
    </AppBottomSheet>
  );
}

// ---------- 2. waiting: the three steps of the analysis, one block in the middle ----------
export function PostureWaitView({
  failed,
  meta,
  steps,
  error,
  onBack,
  onRetry,
  onAgain,
}: {
  failed: boolean;
  meta: string;
  steps: { title: string; description: string; state: 'done' | 'active' | 'waiting' }[];
  error: string | null;
  onBack: () => void;
  // Send the same video again, and film a new one: each only when it can help.
  onRetry?: () => void;
  onAgain?: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <ScreenHeader onBack={onBack} title="자세 분석" />
      <ScrollView contentContainerStyle={[styles.wait, { paddingBottom: insets.bottom + 72 }]} showsVerticalScrollIndicator={false}>
        <Headline lines={failed ? [[{ text: '분석을' }], [{ text: '마치지 못했어요' }]] : [[{ text: '자세를' }], [{ text: '살펴보고 있어요' }]]} />
        <Text style={[styles.note, styles.waitMeta]}>
          {meta}
          {failed ? '' : ' · 보통 10초 안에 끝나요'}
        </Text>
        <View style={styles.steps}>
          {steps.map((step, index) => (
            <View key={step.title} style={[styles.step, index > 0 && styles.stepNext]}>
              <View style={[styles.stepBox, step.state === 'done' && styles.on]}>
                {step.state === 'done' ? (
                  <CheckIcon color={colors.onPrimary} height={18} width={18} />
                ) : step.state === 'active' && !failed ? (
                  <ActivityIndicator color={colors.textPrimary} size="small" />
                ) : (
                  <Text style={styles.stepNo}>{index + 1}</Text>
                )}
              </View>
              <View style={styles.grow}>
                <Text style={[styles.words, step.state === 'waiting' && styles.faint]}>{step.title}</Text>
                <Text style={styles.note}>{step.description}</Text>
              </View>
            </View>
          ))}
        </View>
        {error ? (
          <Text accessibilityRole="alert" style={[styles.words, styles.center]}>
            {error}
          </Text>
        ) : null}
        <Text style={[styles.note, styles.center]}>분석이 끝나면 영상은 바로 지우고, 관절 위치와 결과만 남겨요.</Text>
        {onRetry || onAgain ? (
          <View style={styles.ctl}>
            {onAgain ? (
              <Pressable accessibilityRole="button" onPress={onAgain} style={({ pressed }) => [styles.go, styles.half, onRetry ? styles.ghost : null, pressed && styles.goPressed]}>
                <Text style={styles.goText}>다시 찍기</Text>
              </Pressable>
            ) : null}
            {onRetry ? (
              <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.go, styles.half, pressed && styles.goPressed]}>
                <Text style={styles.goText}>다시 보내기</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

// ---------- 3. the result: how my form was, and what to fix ----------
export interface PostureAngleRow {
  label: string;
  target: string;
  value: string;
  status: string;
  off: boolean;
}
export interface PostureRep {
  id: string;
  number: number;
  score: number;
  scene: string;
  angles: PostureAngleRow[];
}
export interface PostureFix {
  id: string;
  title: string;
  when: string;
  why: string;
  steps: string[];
}

// The score and the things to fix come first; each repetition's measured angles are one tap away.
// No red for a low score: the numbers stand next to the standard, and what is outside it is said in
// dark words. Real numbers, no drawn figure.
export function PostureResultView({
  title,
  loading,
  problem,
  summary,
  score,
  passing,
  reps,
  fixes,
  goods,
  onBack,
  onAgain,
  onHome,
}: {
  title: string;
  loading: boolean;
  problem: string | null;
  summary: string;
  score: number;
  passing: number | null;
  reps: PostureRep[];
  fixes: PostureFix[];
  goods: string[];
  onBack: () => void;
  onAgain: () => void;
  onHome: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<string[]>([]);
  const [shown, setShown] = useState<string | null>(null);
  const only = reps.length === 1 ? reps[0] : null;
  // With one repetition its angles are on the card already, so there is no box to open.
  const rep = only ? null : (reps.find((item) => item.id === shown) ?? null);
  const toggle = (id: string) => setOpen((ids) => (ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]));
  const angles = (rows: PostureAngleRow[]) =>
    rows.map((row, index) => (
      <View key={row.label + index} style={[styles.angle, index > 0 && styles.angleNext]}>
        <View style={styles.grow}>
          <Text style={styles.words}>{row.label}</Text>
          {row.target ? <Text style={styles.note}>{row.target}</Text> : null}
        </View>
        <View style={styles.angleValue}>
          <Text style={styles.value}>{row.value}</Text>
          <Text style={row.off ? styles.offText : styles.note}>{row.status}</Text>
        </View>
      </View>
    ));

  return (
    <View style={styles.root}>
      <ScreenHeader onBack={onBack} title={title} />
      {loading ? (
        <ALoading />
      ) : problem ? (
        <View style={styles.problem}>
          <Text accessibilityRole="header" style={styles.title}>
            결과를 표시할 수 없어요
          </Text>
          <Text style={[styles.words, styles.center]}>{problem}</Text>
          <Pressable accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.go, styles.ghost, styles.problemGo, pressed && styles.goPressed]}>
            <Text style={styles.goSmall}>돌아가기</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.result, { paddingBottom: Math.max(12, insets.bottom) + 8 }]} showsVerticalScrollIndicator={false}>
          {/* the score in the headline, what the app saw in one line under it, as the report tells a week */}
          <Headline lines={[[{ text: '오늘 자세는' }], [{ text: `${score}점`, mark: true }, { text: passing != null ? (score >= passing ? '으로 기준을 넘었어요' : '이에요') : '이에요' }]]} />
          {summary ? <Text style={styles.summary}>{summary}</Text> : null}
          <View style={styles.scoreCard}>
            <View style={styles.scoreTop}>
              <Text style={styles.cardLab}>{reps.length > 1 ? `${reps.length}회 각각의 점수` : '이번 동작'}</Text>
              {passing != null ? <Text style={styles.note}>기준 {passing}점</Text> : null}
            </View>
            {only ? (
              only.angles.length > 0 ? <View style={styles.inline}>{angles(only.angles)}</View> : null
            ) : reps.length > 0 ? (
              <View style={styles.reps}>
                {reps.map((item) => (
                  <Pressable
                    accessibilityLabel={`${item.number}회째 ${item.score}점, 각도 보기`}
                    accessibilityRole="button"
                    key={item.id}
                    onPress={() => setShown(item.id)}
                    style={({ pressed }) => [styles.rep, reps.length > 5 ? styles.repGrid : styles.repRow, pressed && styles.repPressed]}
                  >
                    <Text style={styles.note}>{item.number}회째</Text>
                    <Text style={styles.value}>{item.score}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          {goods.length > 0 ? (
            <>
              <Text style={[styles.q, styles.section]}>잘한 점</Text>
              <View style={styles.good}>
                {goods.map((line) => (
                  <View key={line} style={styles.goodRow}>
                    <View style={styles.goodCheck}><CheckIcon color={colors.onPrimary} height={12} width={12} /></View>
                    <Text style={[styles.words, styles.grow]}>{line}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {fixes.length > 0 ? <Text style={[styles.q, styles.section]}>고칠 점 {fixes.length}</Text> : null}
          {fixes.map((fix) => {
            const expanded = open.includes(fix.id);
            return (
              <View key={fix.id} style={styles.fold}>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => toggle(fix.id)} style={styles.foldHead}>
                  <View style={styles.grow}>
                    <Text style={styles.words}>{fix.title}</Text>
                    {fix.when ? <Text style={styles.note}>{fix.when}</Text> : null}
                  </View>
                  <Text style={styles.pm}>{expanded ? '−' : '+'}</Text>
                </Pressable>
                {expanded ? (
                  <View style={styles.foldBody}>
                    <Text style={styles.note}>왜 그럴까요</Text>
                    <Text style={styles.words}>{fix.why}</Text>
                    {fix.steps.length > 0 ? <Text style={[styles.note, styles.foldQ]}>이렇게 고쳐요</Text> : null}
                    {fix.steps.map((step, index) => (
                      <Text key={step} style={styles.words}>
                        {index + 1}. {step}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}

          <Text style={[styles.note, styles.center, styles.resultNote]}>카메라 한 대로 본 결과라 참고용이에요</Text>
          <View style={styles.ctl}>
            <Pressable accessibilityRole="button" onPress={onAgain} style={({ pressed }) => [styles.go, styles.ghost, styles.half, pressed && styles.goPressed]}>
              <Text style={styles.goText}>다시 찍기</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onHome} style={({ pressed }) => [styles.go, styles.half, pressed && styles.goPressed]}>
              <Text style={styles.goText}>홈으로</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
      <AppBottomSheet contentStyle={styles.sheet} onClose={() => setShown(null)} title={rep ? `${rep.number}회째 · ${rep.score}점` : ''} visible={rep !== null}>
        {rep ? (
          <>
            <Text style={styles.note}>{rep.scene} 장면</Text>
            <View>{angles(rep.angles)}</View>
          </>
        ) : null}
      </AppBottomSheet>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  const big = { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontVariant: ['tabular-nums'] as ['tabular-nums'] } as const;
  const note = { ...a.note, fontFamily: fontFamilies.pretendardRegular } as const;
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    words: { color: colors.textPrimary, fontSize: 14.5, lineHeight: 22 },
    note,
    q: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 15, lineHeight: 21 },
    center: { textAlign: 'center' },
    grow: { flex: 1, minWidth: 0 },
    faint: { color: colors.textSecondary },
    on: a.on,
    onText: a.onText,
    off: { opacity: 0.4 },
    title: { ...big, fontSize: 22, lineHeight: 30, textAlign: 'center' },
    value: { ...big, fontSize: 17, lineHeight: 23 },
    go: { ...a.go, height: 54 },
    ghost: { backgroundColor: colors.surface },
    goPressed: a.goPressed,
    goText: a.goText,
    goSmall: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 15, lineHeight: 21 },
    half: { flex: 1 },
    ctl: { flexDirection: 'row', gap: 10 },
    sheet: { gap: 12, paddingBottom: 24, paddingHorizontal: 20, paddingTop: 0 },
    sheetQ: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 12.5, marginBottom: 0, marginTop: 10 },
    bulletRow: { flexDirection: 'row', gap: 10 },
    bullet: { backgroundColor: colors.textPrimary, borderRadius: 3, height: 6, marginTop: 8, width: 6 },

    // ---- filming: the camera is the big thing ----
    shoot: { paddingHorizontal: 20 },
    chips: { backgroundColor: colors.surface, borderRadius: 999, flexDirection: 'row', marginTop: 12, padding: 4 },
    chip: { alignItems: 'center', borderRadius: 999, flex: 1, height: 38, justifyContent: 'center', paddingHorizontal: 4 },
    chipText: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardBold, fontSize: 12.5, lineHeight: 18 },
    cam: { backgroundColor: '#17161C', borderRadius: 28, flex: 1, marginTop: 14, minHeight: 220, overflow: 'hidden' },
    guide: { borderColor: 'rgba(255, 255, 255, 0.78)', borderRadius: 22, borderStyle: 'dashed', borderWidth: 2, position: 'absolute' },
    guideStand: { bottom: 64, left: 78, right: 78, top: 48 },
    guideLie: { bottom: '36%', left: 20, right: 20, top: '34%' },
    // Under the frame, where it cannot run over the dashes.
    frameLabel: { color: '#FFFFFF', fontSize: 12.5, left: 8, lineHeight: 18, position: 'absolute', right: 8, textAlign: 'center' },
    frameLabelStand: { bottom: 32 },
    frameLabelLie: { marginTop: 14, top: '64%' },
    took: { backgroundColor: colors.lilac, height: 3, left: 0, position: 'absolute', top: 0 },
    state: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 99, flexDirection: 'row', gap: 7, height: 30, left: 12, paddingLeft: 11, paddingRight: 12, position: 'absolute', top: 14 },
    stateDot: { backgroundColor: colors.now, borderRadius: 4, height: 8, width: 8 },
    stateText: { color: '#010101', fontFamily: fontFamilies.pretendardBold, fontSize: 12, lineHeight: 17 },
    cover: { alignItems: 'center', backgroundColor: 'rgba(23, 22, 28, 0.82)', bottom: 0, gap: 8, justifyContent: 'center', left: 0, paddingHorizontal: 28, position: 'absolute', right: 0, top: 0 },
    coverTitle: { color: '#FFFFFF', fontFamily: fontFamilies.pretendardExtraBold, fontSize: 20, lineHeight: 28, textAlign: 'center' },
    coverText: { color: '#C9C8D3', fontSize: 13, lineHeight: 20, textAlign: 'center' },
    coverGo: { backgroundColor: '#FFFFFF', height: 44, marginTop: 10, paddingHorizontal: 20 },
    hint: { marginBottom: 12, marginTop: 14, textAlign: 'center' },
    album: { paddingHorizontal: 22 },
    under: { alignItems: 'center', height: 40, justifyContent: 'center', marginTop: 2 },
    link: a.link,

    // ---- waiting: one block a little above the middle, the three steps plainly on the page ----
    wait: { flexGrow: 1, gap: 14, justifyContent: 'center', paddingHorizontal: 20 },
    waitMeta: { marginTop: -6 },
    steps: { paddingHorizontal: 2 },
    step: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 60 },
    stepNext: { borderTopColor: colors.border, borderTopWidth: 1 },
    stepBox: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 14, height: 28, justifyContent: 'center', width: 28 },
    stepNo: { ...a.p12, color: colors.textSecondary, fontFamily: fontFamilies.pretendardBold },

    // ---- the result ----
    problem: { alignItems: 'center', flex: 1, gap: 10, justifyContent: 'center', padding: 24 },
    problemGo: { height: 46, marginTop: 8, paddingHorizontal: 20 },
    result: { gap: 0, paddingHorizontal: 20, paddingTop: 8 },
    summary: { color: colors.textSecondary, fontSize: 14.5, lineHeight: 22, marginBottom: 16, marginTop: 8 },
    scoreCard: { ...a.card, marginTop: 8, paddingBottom: 18, paddingHorizontal: 20, paddingTop: 18 },
    scoreTop: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between' },
    cardLab: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 12.5, lineHeight: 18 },
    reps: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
    rep: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 18, gap: 1, paddingBottom: 10, paddingTop: 9 },
    // Up to five share one row; more go five to a row (ten squats were too narrow to read in one row).
    repRow: { flex: 1 },
    repGrid: { width: '18%' },
    repPressed: { opacity: 0.7 },
    inline: { marginBottom: -12, marginTop: 8 },
    angle: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingHorizontal: 2, paddingVertical: 13 },
    angleNext: { borderTopColor: colors.border, borderTopWidth: 1 },
    angleValue: { alignItems: 'flex-end' },
    // Outside the range: said in bold dark words, never in red (red letters feel like a failed test).
    offText: { ...a.p12, color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold },
    section: { marginBottom: 10, marginHorizontal: 4, marginTop: 24 },
    fold: { backgroundColor: colors.surface, borderRadius: 24, marginBottom: 10, paddingHorizontal: 20 },
    foldHead: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 64, paddingVertical: 12 },
    pm: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 20, lineHeight: 24, textAlign: 'center', width: 24 },
    foldBody: { gap: 8, paddingBottom: 18 },
    foldQ: { marginTop: 6 },
    good: { ...a.card, gap: 12, paddingHorizontal: 20, paddingVertical: 18 },
    goodRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
    goodCheck: { alignItems: 'center', backgroundColor: colors.textPrimary, borderRadius: 10, height: 20, justifyContent: 'center', marginTop: 1, width: 20 },
    resultNote: { marginBottom: 12, marginTop: 24 },
  } as const;
}
