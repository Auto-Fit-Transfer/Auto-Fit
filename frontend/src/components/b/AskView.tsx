import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CheckIcon from '@/assets/icons/system/Check.svg';
import ArrowUpIcon from '@/assets/icons/common/chevrons/Up.svg';
import DownIcon from '@/assets/icons/common/chevrons/Down.svg';
import BackIcon from '@/assets/icons/common/chevrons/Left.svg';
import type { AskLine } from '@/src/components/a/AskView';
import { ChatCharacterAvatar, type ChatAvatarVariant } from '@/src/components/chat/ChatCharacterAvatar';
import { AppBottomSheet, Text, TextInput } from '@/src/components/common';
import type { ChatCharacterId } from '@/src/features/chat/chatCharacters';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

// Renewal B's 물어보기 (b-ask.html), the app's AI health talk: one of the three chat characters answers.
// Its words are on black (the app's voice), mine on white. Before the first question its card and what
// can be asked sit as one block a little above the middle; the dark talk bar of the home stays at the foot.
// The face and name at the top right open the choice. A view only; app/chat/index.tsx fills it.

// The coach's third picture is another person, so the coach answers with the first (as b-ask.html).
const answerFace = (id: ChatCharacterId): ChatAvatarVariant => (id === 'coach' ? 0 : 2);

export function AskView({
  characterId,
  name,
  greeting,
  lines,
  loading,
  failed,
  waiting,
  error,
  draft,
  canType,
  prompts,
  onBack,
  onDraft,
  onSend,
  onWho,
}: {
  characterId: ChatCharacterId;
  name: string;
  greeting: string;
  lines: AskLine[];
  loading: boolean;
  failed?: ReactNode; // in place of the talk when it could not be opened at all
  waiting: boolean; // an answer is on its way
  error: string | null;
  draft: string;
  canType: boolean;
  prompts: string[];
  onBack: () => void;
  onDraft: (text: string) => void;
  onSend: (text?: string) => void; // with no text it sends the field; a ready-made question goes at once
  onWho: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setInterval(() => setStep((value) => value + 1), 300);
    return () => clearInterval(timer);
  }, [waiting]);
  const talking = lines.length > 0 || waiting || Boolean(error);
  const canSend = canType && draft.trim().length > 0;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
      <View style={[styles.bar, { marginTop: insets.top + 6 }]}>
        <Pressable accessibilityLabel="뒤로 가기" accessibilityRole="button" hitSlop={6} onPress={onBack} style={styles.back}>
          <BackIcon color={colors.textPrimary} height={22} width={22} />
        </Pressable>
        <View pointerEvents="none" style={styles.titleLayer}>
          <Text accessibilityRole="header" style={styles.title}>물어보기</Text>
        </View>
        <Pressable accessibilityLabel={`대화 상대 ${name}, 바꾸기`} accessibilityRole="button" hitSlop={8} onPress={onWho} style={styles.who}>
          <ChatCharacterAvatar characterId={characterId} size={28} />
          <Text style={styles.whoText}>{name}</Text>
          <DownIcon color={colors.textSecondary} height={12} width={12} />
        </Pressable>
      </View>
      <Text style={styles.note}>건강 판단은 참고용이에요. 증상이 있으면 병원에 문의해 주세요.</Text>

      {loading && !talking ? (
        <View style={styles.center}><ActivityIndicator color={colors.textPrimary} /></View>
      ) : failed ? (
        failed
      ) : talking ? (
        <ScrollView
          accessibilityLiveRegion="polite"
          contentContainerStyle={styles.talk}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
          ref={scroll}
          showsVerticalScrollIndicator={false}
          style={styles.talkBox}
        >
          {lines.map((line) =>
            line.mine !== undefined ? (
              <View key={line.key} style={styles.mine}>
                <Text style={styles.mineText}>{line.mine}</Text>
              </View>
            ) : (
              <View key={line.key} style={styles.answer}>
                <ChatCharacterAvatar characterId={characterId} size={32} variant={answerFace(characterId)} />
                <View style={styles.bubble}>
                  <Text style={styles.bubbleText}>{line.answer}</Text>
                  {line.card ? (
                    <View style={styles.duo}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ busy: line.card.waiting, disabled: line.card.busy }}
                        disabled={line.card.busy}
                        onPress={line.card.onYes}
                        style={[styles.pill, styles.pillYes, line.card.busy && styles.off]}
                      >
                        {line.card.waiting ? <ActivityIndicator color={colors.lilacInk} size="small" /> : <Text style={[styles.pillText, styles.pillYesText]}>이대로 조정</Text>}
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ disabled: line.card.busy }}
                        disabled={line.card.busy}
                        onPress={line.card.onNo}
                        style={[styles.pill, line.card.busy && styles.off]}
                      >
                        <Text style={styles.pillText}>그대로 할게요</Text>
                      </Pressable>
                    </View>
                  ) : null}
                  {line.note ? (
                    <View style={styles.acted}>
                      {line.done ? <View style={styles.check}><CheckIcon color={colors.aiCard} height={12} width={12} /></View> : null}
                      <Text style={[styles.actedText, !line.done && styles.actedQuiet]}>{line.note}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ),
          )}
          {waiting ? (
            <View style={styles.answer}>
              <ChatCharacterAvatar characterId={characterId} size={32} />
              <View accessibilityLabel="답을 준비하는 중" accessible style={styles.bubble}>
                <Text style={styles.bubbleText}>기록을 살펴보고 있어요</Text>
                <View style={styles.dots}>
                  {[0, 1, 2].map((dot) => (
                    <View key={dot} style={[styles.dot, { opacity: step % 3 === dot ? 1 : 0.3 }]} />
                  ))}
                </View>
              </View>
            </View>
          ) : null}
          {error ? <Text accessibilityRole="alert" style={styles.fail}>{error}</Text> : null}
        </ScrollView>
      ) : (
        <View style={styles.hello}>
          <View style={styles.ai}>
            <ChatCharacterAvatar characterId={characterId} size={44} variant={1} />
            <View style={styles.grow}>
              <Text style={styles.aiName}>{name}</Text>
              <Text style={styles.aiTitle}>{greeting}</Text>
            </View>
          </View>
          <Text style={styles.q}>이렇게 물어보세요</Text>
          <View style={styles.asks}>
            {prompts.map((prompt) => (
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canType }} disabled={!canType} key={prompt} onPress={() => onSend(prompt)} style={styles.ask}>
                <Text style={styles.askText}>{prompt}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <View style={[styles.foot, { paddingBottom: Math.max(12, insets.bottom) }]}>
        {talking ? (
          <ScrollView contentContainerStyle={styles.quick} horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false}>
            {prompts.slice(0, 2).map((prompt) => (
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canType }} disabled={!canType} key={prompt} onPress={() => onSend(prompt)} style={styles.chip}>
                <Text style={styles.chipText}>{prompt}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <View style={styles.send}>
          <TextInput
            accessibilityLabel="물어볼 말"
            editable={canType}
            maxLength={500}
            onChangeText={onDraft}
            onSubmitEditing={() => onSend()}
            placeholder="무엇이 궁금해요?"
            placeholderTextColor={colors.onAiMuted}
            returnKeyType="send"
            style={styles.input}
            value={draft}
          />
          <Pressable
            accessibilityLabel="보내기"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSend }}
            disabled={!canSend}
            onPress={() => onSend()}
            style={[styles.go, !canSend && styles.off]}
          >
            <ArrowUpIcon color={colors.aiCard} height={18} width={18} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// The choice of who answers: the three faces, and how the one looked at answers the same line (only the way
// of speaking differs). It is kept only when 「…와 이야기하기」 is pressed.
export function WhoSheet({
  visible,
  chosen,
  cast,
  onClose,
  onPick,
}: {
  visible: boolean;
  chosen: ChatCharacterId;
  cast: { id: ChatCharacterId; name: string; role: string; sample: string }[];
  onClose: () => void;
  onPick: (id: ChatCharacterId) => void;
}) {
  const styles = useThemedStyles(createStyles);
  const [look, setLook] = useState(chosen);
  const [opened, setOpened] = useState(visible);
  if (visible !== opened) {
    // each opening starts at the one chosen now
    setOpened(visible);
    if (visible) setLook(chosen);
  }
  const one = cast.find((item) => item.id === look) ?? cast[0];
  return (
    <AppBottomSheet contentStyle={styles.sheet} onClose={onClose} title="누구와 이야기할까요?" visible={visible}>
      <View accessibilityRole="radiogroup" style={styles.cast}>
        {cast.map((item) => (
          <Pressable accessibilityRole="radio" accessibilityState={{ checked: item.id === look }} key={item.id} onPress={() => setLook(item.id)} style={styles.castItem}>
            <View style={[styles.ring, item.id === look && styles.ringOn]}>
              <ChatCharacterAvatar characterId={item.id} size={72} variant={1} />
            </View>
            <Text style={[styles.castName, item.id === look && styles.castNameOn]}>{item.name}</Text>
            <Text style={styles.castRole}>{item.role}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.hear}>
        <View style={styles.mine}><Text style={styles.mineText}>3일째 운동을 못 했어요</Text></View>
        <View style={styles.answer}>
          <ChatCharacterAvatar characterId={one.id} size={32} />
          <View style={styles.bubble}><Text style={styles.bubbleText}>{one.sample}</Text></View>
        </View>
      </View>
      <Text style={styles.sheetNote}>말투만 다르고 알려 주는 내용은 같아요</Text>
      <Pressable accessibilityRole="button" onPress={() => onPick(one.id)} style={styles.goWide}>
        <Text style={styles.goWideText}>{one.name}와 이야기하기</Text>
      </Pressable>
    </AppBottomSheet>
  );
}

function createStyles({ colors }: AppTheme) {
  const b14 = { fontFamily: fontFamilies.pretendardBold, fontSize: 14, lineHeight: 20 } as const;
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, paddingHorizontal: 24, width: '100%' },
    grow: { flex: 1, minWidth: 0 },
    center: { flex: 1, justifyContent: 'center' },
    bar: { alignItems: 'center', flexDirection: 'row', height: 52 },
    back: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
    titleLayer: { alignItems: 'center', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0 },
    title: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 16, lineHeight: 22 },
    who: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 999, flexDirection: 'row', gap: 6, marginLeft: 'auto', minHeight: 44, paddingLeft: 8, paddingRight: 12 },
    whoText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 12.5, lineHeight: 18 },
    note: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 18, marginTop: 4, textAlign: 'center' },
    // ---- before the first question: one block a little above the middle ----
    hello: { flex: 1, gap: 12, justifyContent: 'center', paddingBottom: '14%' },
    ai: { alignItems: 'center', backgroundColor: colors.aiCard, borderRadius: 28, flexDirection: 'row', gap: 12, padding: 20 },
    aiName: { color: colors.aiHello, fontFamily: fontFamilies.pretendardBold, fontSize: 13, lineHeight: 18 },
    aiTitle: { color: colors.onAi, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 17, lineHeight: 24 },
    q: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 12.5, lineHeight: 18, marginTop: 6, paddingLeft: 4 },
    asks: { alignItems: 'flex-start', gap: 8 },
    ask: { backgroundColor: colors.surface, borderRadius: 999, justifyContent: 'center', minHeight: 44, paddingHorizontal: 18 },
    askText: { ...b14, color: colors.textPrimary },
    // ---- the talk: the newest line sits just above the bar ----
    talkBox: { flex: 1, marginTop: 8 },
    talk: { flexGrow: 1, gap: 12, justifyContent: 'flex-end', paddingBottom: 12, paddingTop: 8 },
    mine: { alignSelf: 'flex-end', backgroundColor: colors.surface, borderBottomRightRadius: 6, borderRadius: 20, maxWidth: '80%', paddingHorizontal: 16, paddingVertical: 12 },
    mineText: { color: colors.textPrimary, fontSize: 14.5, lineHeight: 22 },
    answer: { alignItems: 'flex-start', flexDirection: 'row', gap: 8, maxWidth: '92%' },
    bubble: { backgroundColor: colors.aiCard, borderRadius: 20, borderTopLeftRadius: 6, flexShrink: 1, gap: 10, paddingHorizontal: 16, paddingVertical: 14 },
    bubbleText: { color: colors.onAi, fontSize: 14.5, lineHeight: 22 },
    duo: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    pill: { alignItems: 'center', backgroundColor: colors.aiRaised, borderRadius: 999, justifyContent: 'center', minHeight: 38, minWidth: 96, paddingHorizontal: 16 },
    pillYes: { backgroundColor: colors.lilac },
    pillText: { color: colors.onAi, fontFamily: fontFamilies.pretendardBold, fontSize: 13, lineHeight: 18 },
    pillYesText: { color: colors.lilacInk },
    acted: { alignItems: 'center', flexDirection: 'row', gap: 8 },
    check: { alignItems: 'center', backgroundColor: colors.lilac, borderRadius: 10, height: 20, justifyContent: 'center', width: 20 },
    actedText: { color: colors.onAi, flexShrink: 1, fontFamily: fontFamilies.pretendardBold, fontSize: 13.5, lineHeight: 19 },
    actedQuiet: { color: colors.onAiMuted, fontFamily: fontFamilies.pretendardRegular },
    dots: { flexDirection: 'row', gap: 5 },
    dot: { backgroundColor: colors.lilac, borderRadius: 4, height: 8, width: 8 },
    off: { opacity: 0.4 },
    fail: { alignSelf: 'center', color: colors.textSecondary, fontSize: 12.5, lineHeight: 18, textAlign: 'center' },
    // ---- the dark talk bar ----
    foot: { gap: 10, paddingTop: 8 },
    quick: { gap: 6 },
    chip: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 999, height: 38, justifyContent: 'center', paddingHorizontal: 14 },
    chipText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 12.5, lineHeight: 18 },
    send: { alignItems: 'center', backgroundColor: colors.aiBar, borderRadius: 999, flexDirection: 'row', gap: 8, paddingLeft: 18, paddingRight: 4, paddingVertical: 4 },
    input: { color: colors.onAi, flex: 1, fontSize: 14.5, minHeight: 40, minWidth: 0, paddingVertical: 8 },
    go: { alignItems: 'center', backgroundColor: colors.lilac, borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
    // ---- who answers ----
    sheet: { gap: 14, paddingBottom: 24, paddingHorizontal: 20, paddingTop: 4 },
    cast: { flexDirection: 'row', gap: 8 },
    castItem: { alignItems: 'center', flex: 1, paddingVertical: 6 },
    ring: { borderColor: 'transparent', borderRadius: 41, borderWidth: 2, marginBottom: 10, padding: 3 },
    ringOn: { borderColor: colors.textPrimary },
    castName: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardBold, fontSize: 14.5, lineHeight: 20 },
    castNameOn: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardExtraBold },
    castRole: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, textAlign: 'center' },
    hear: { backgroundColor: colors.background, borderRadius: 20, gap: 10, padding: 14 },
    sheetNote: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 18, textAlign: 'center' },
    goWide: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 999, height: 54, justifyContent: 'center' },
    goWideText: { color: colors.onPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 16, lineHeight: 22 },
  } as const;
}
