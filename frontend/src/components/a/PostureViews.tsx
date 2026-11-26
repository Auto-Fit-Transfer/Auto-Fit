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
import { HeroHead, type Who } from './sprites';

// Renewal A's 자세 분석, the three screens as views that only show what they are given (the screens
// under app/exercise fill them): filming, waiting for the analysis, and the result.

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
            {/* Red only here: the sign of recording, seen from three steps away. */}
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
      <Pressable accessibilityRole="button" hitSlop={14} onPress={onTips} style={styles.under}>
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
        <Text accessibilityRole="header" style={styles.title}>
          {failed ? '분석을 마치지 못했어요' : '자세를 분석하고 있어요'}
        </Text>
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
                  <ActivityIndicator color={colors.ink} size="small" />
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
  who,
  tier,
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
  who: Who;
  tier: number;
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
          {summary ? (
            <View style={styles.ask}>
              <View style={styles.face}>
                <HeroHead tier={tier} who={who} />
              </View>
              <View style={styles.say}>
                <View style={styles.sayTail} />
                <Text style={styles.words}>{summary}</Text>
              </View>
            </View>
          ) : null}
          <View style={styles.scoreCard}>
            <View style={styles.scoreTop}>
              <Text style={styles.score}>
                {score}
                <Text style={styles.scoreUnit}> 점</Text>
              </Text>
              {/* how far from the line, so 78 next to 80 reads as "2 short", with what to fix listed below */}
              {passing != null ? <Text style={styles.note}>기준 {passing}점 · {score >= passing ? '넘었어요' : `${passing - score}점 모자라요`}</Text> : null}
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

          {goods.length > 0 ? (
            <>
              <Text style={[styles.q, styles.section]}>잘한 점</Text>
              <View style={styles.good}>
                {goods.map((line) => (
                  <View key={line} style={styles.goodRow}>
                    <CheckIcon color={colors.success} height={20} width={20} />
                    <Text style={[styles.words, styles.grow]}>{line}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

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
  const big = { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold } as const;
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    words: { ...a.p15, color: colors.ink },
    note: a.note,
    q: a.q,
    center: { textAlign: 'center' },
    grow: { flex: 1, minWidth: 0 },
    faint: { color: colors.textSecondary },
    on: a.on,
    onText: a.onText,
    off: { opacity: 0.4 },
    title: { ...big, fontSize: 24, lineHeight: 28, textAlign: 'center' },
    value: { ...big, fontSize: 24, lineHeight: 28 },
    go: a.go,
    ghost: a.goGhost,
    goPressed: a.goPressed,
    goText: a.goText,
    goSmall: { ...a.p15, color: colors.ink },
    half: { flex: 1 },
    // 4 taller than its buttons: the ledge they stand on.
    ctl: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
    sheet: { gap: 12, paddingBottom: 24, paddingHorizontal: 16, paddingTop: 0 },
    sheetQ: { marginBottom: 0, marginTop: 10 },
    bulletRow: { flexDirection: 'row', gap: 10 },
    bullet: { backgroundColor: colors.primary, borderColor: colors.ink, borderWidth: 2, height: 12, marginTop: 5, width: 12 },

    // ---- filming ----
    shoot: { paddingHorizontal: 16 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
    chip: { ...a.chip, flexBasis: '18%', flexGrow: 1, paddingHorizontal: 6 },
    chipText: a.chipText,
    cam: {
      backgroundColor: '#262A45',
      borderColor: colors.ink,
      borderRadius: 18,
      borderWidth: 2,
      boxShadow: '0 4px 0 rgba(32, 35, 63, 0.3)',
      flex: 1,
      marginTop: 14,
      minHeight: 220,
      overflow: 'hidden',
    },
    guide: { borderColor: 'rgba(255, 255, 255, 0.85)', borderRadius: 20, borderStyle: 'dashed', borderWidth: 3, position: 'absolute' },
    guideStand: { bottom: 64, left: 78, right: 78, top: 44 },
    guideLie: { bottom: '36%', left: 20, right: 20, top: '34%' },
    // Under the frame, where it cannot run over the dashes.
    frameLabel: { ...a.p12, color: '#FFFFFF', left: 8, position: 'absolute', right: 8, textAlign: 'center' },
    frameLabelStand: { bottom: 30 },
    frameLabelLie: { marginTop: 14, top: '64%' },
    took: { backgroundColor: colors.danger, height: 6, left: 0, position: 'absolute', top: 0 },
    state: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.ink,
      borderRadius: 99,
      borderWidth: 2,
      flexDirection: 'row',
      gap: 7,
      height: 30,
      left: 12,
      paddingLeft: 10,
      paddingRight: 12,
      position: 'absolute',
      top: 14,
    },
    stateDot: { backgroundColor: colors.danger, borderRadius: 4, height: 8, width: 8 },
    stateText: { ...a.p12, color: colors.ink },
    cover: {
      alignItems: 'center',
      backgroundColor: 'rgba(22, 24, 46, 0.72)',
      bottom: 0,
      gap: 10,
      justifyContent: 'center',
      left: 0,
      paddingHorizontal: 32,
      position: 'absolute',
      right: 0,
      top: 0,
    },
    coverTitle: { color: '#FFFFFF', fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, lineHeight: 31, textAlign: 'center' },
    coverText: { ...a.p15, color: '#FFFFFF', textAlign: 'center' },
    coverGo: { backgroundColor: colors.surface, height: 46, marginTop: 10, paddingHorizontal: 18 },
    hint: { marginBottom: 14, marginTop: 14, textAlign: 'center' },
    album: { paddingHorizontal: 18 },
    under: { alignItems: 'center', height: 40, justifyContent: 'center', marginTop: 2 },
    link: a.link,

    // ---- waiting ----
    wait: { flexGrow: 1, gap: 14, justifyContent: 'center', paddingHorizontal: 16 },
    waitMeta: { marginTop: -6, textAlign: 'center' },
    steps: { ...a.card, paddingHorizontal: 14, paddingVertical: 4 },
    step: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 64 },
    stepNext: { borderTopColor: colors.track, borderTopWidth: 2 },
    stepBox: { ...a.tick },
    stepNo: { ...a.p12, color: colors.textSecondary },

    // ---- the result ----
    problem: { alignItems: 'center', flex: 1, gap: 10, justifyContent: 'center', padding: 24 },
    problemGo: { height: 46, marginTop: 8, paddingHorizontal: 18 },
    result: { paddingHorizontal: 16, paddingTop: 8 },
    ask: { alignItems: 'center', flexDirection: 'row', gap: 12, marginBottom: 16 },
    face: {
      alignItems: 'center',
      backgroundColor: colors.primaryLight,
      borderColor: colors.ink,
      borderRadius: 11,
      borderWidth: 2,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    say: { backgroundColor: colors.surface, borderColor: colors.ink, borderRadius: 14, borderWidth: 2, flexShrink: 1, paddingHorizontal: 13, paddingVertical: 8 },
    sayTail: {
      backgroundColor: colors.surface,
      borderBottomWidth: 2,
      borderColor: colors.ink,
      borderLeftWidth: 2,
      height: 10,
      left: -7,
      position: 'absolute',
      top: 13,
      transform: [{ rotate: '45deg' }],
      width: 10,
    },
    scoreCard: { ...a.card, paddingBottom: 18, paddingHorizontal: 18, paddingTop: 20 },
    scoreTop: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between' },
    score: { ...big, fontSize: 72, lineHeight: 76 },
    scoreUnit: { ...a.p15, color: colors.ink },
    reps: { borderTopColor: colors.track, borderTopWidth: 2, flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18, paddingBottom: 3, paddingTop: 18 },
    rep: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.ink,
      borderRadius: 12,
      borderWidth: 2,
      boxShadow: '0 3px 0 rgba(32, 35, 63, 0.3)',
      gap: 3,
      paddingBottom: 10,
      paddingTop: 9,
    },
    // Up to five share one row; more go five to a row (ten squats were too narrow to read in one row).
    repRow: { flex: 1 },
    repGrid: { width: '18%' },
    repPressed: { backgroundColor: colors.primaryLight },
    inline: { borderTopColor: colors.track, borderTopWidth: 2, marginBottom: -12, marginTop: 14 },
    angle: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingHorizontal: 4, paddingVertical: 14 },
    angleNext: { borderTopColor: colors.track, borderTopWidth: 2 },
    angleValue: { alignItems: 'flex-end' },
    // Outside the range: said in dark words, not in red (red letters feel like a failed test).
    offText: { ...a.p12, color: colors.ink, fontFamily: fontFamilies.galmuri11Bold },
    section: { marginBottom: 8, marginHorizontal: 2, marginTop: 24 },
    fold: { ...a.card, marginBottom: 10, paddingHorizontal: 16 },
    foldHead: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 66, paddingVertical: 12 },
    pm: {
      ...a.p15,
      backgroundColor: colors.primaryLight,
      borderColor: colors.ink,
      borderRadius: 9,
      borderWidth: 2,
      color: colors.ink,
      height: 30,
      lineHeight: 26,
      overflow: 'hidden',
      textAlign: 'center',
      width: 30,
    },
    foldBody: { gap: 8, paddingBottom: 18 },
    foldQ: { marginTop: 6 },
    good: { ...a.card, gap: 12, padding: 16 },
    goodRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
    resultNote: { marginBottom: 12, marginTop: 24 },
  } as const;
}
