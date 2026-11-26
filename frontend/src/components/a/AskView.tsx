import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BackIcon from '@/assets/icons/common/chevrons/Left.svg';
import { AppBottomSheet, Text, TextInput } from '@/src/components/common';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { ALoading } from './ALoading';
import { aForm } from './form';
import { Hero, HeroHead, type Who } from './sprites';

// One line of the talk: what I asked, or what my character answered. Under an answer there can be the
// two buttons of a change to today's workout, or the quiet line that says what became of it.
export interface AskLine {
  key: string;
  mine?: string;
  answer?: string;
  note?: string;
  done?: boolean; // the note says the change was made (renewal B puts a check before it)
  card?: { busy: boolean; waiting: boolean; onNo: () => void; onYes: () => void };
}

// Renewal A's 물어보기 (the app's AI health talk): I ask my own character about my record.
// Before the first question the character stands there with its greeting and things to ask; after it,
// a plain list of questions and answers with the character as a small face.
// A view that only shows what it is given; app/chat/index.tsx fills it from the server.
export function AskView({
  who,
  tier,
  tone,
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
  onTone,
}: {
  who: Who;
  tier: number;
  // How the character talks, shown on the button that changes it (다정하게 …).
  tone: string;
  greeting: string;
  lines: AskLine[];
  loading: boolean;
  // Shown in place of the talk when it could not be opened at all.
  failed?: ReactNode;
  // An answer is on its way.
  waiting: boolean;
  error: string | null;
  draft: string;
  canType: boolean;
  prompts: string[];
  onBack: () => void;
  onDraft: (text: string) => void;
  // With no text it sends what is in the field; a ready-made question is sent at once.
  onSend: (text?: string) => void;
  onTone: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const [room, setRoom] = useState(0);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setInterval(() => setStep((value) => value + 1), 300);
    return () => clearInterval(timer);
  }, [waiting]);
  const talking = lines.length > 0 || waiting || Boolean(error);
  const canSend = canType && draft.trim().length > 0;
  const face = (
    <View style={styles.face}>
      <HeroHead tier={tier} who={who} />
    </View>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
      <View style={[styles.bar, { marginTop: insets.top + 6 }]}>
        <Pressable
          accessibilityLabel="뒤로 가기"
          accessibilityRole="button"
          hitSlop={10}
          onPress={onBack}
          style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
        >
          <BackIcon color={colors.textPrimary} height={24} width={24} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>
          물어보기
        </Text>
        <Pressable accessibilityLabel={`말투 바꾸기, 지금은 ${tone}`} accessibilityRole="button" hitSlop={8} onPress={onTone} style={styles.mini}>
          <Text style={styles.miniText}>말투 · {tone}</Text>
        </Pressable>
      </View>
      <Text style={styles.note}>건강 판단은 참고용이에요. 증상이 있으면 병원에 문의해 주세요.</Text>

      {loading && !talking ? (
        <ALoading />
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
                <Text style={styles.words}>{line.mine}</Text>
              </View>
            ) : (
              <View key={line.key} style={styles.answer}>
                {face}
                <View style={styles.answerColumn}>
                  <View style={styles.say}>
                    <View style={styles.sayTail} />
                    <Text style={styles.words}>{line.answer}</Text>
                  </View>
                  {line.card ? (
                    <View style={styles.duo}>
                      <Pressable hitSlop={{ bottom: 1, top: 1 }}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: line.card.busy }}
                        disabled={line.card.busy}
                        onPress={line.card.onNo}
                        style={({ pressed }) => [styles.choice, styles.choiceNo, line.card?.busy && styles.off, pressed && styles.choicePressed]}
                      >
                        <Text style={styles.choiceText}>그대로 할게요</Text>
                      </Pressable>
                      <Pressable hitSlop={{ bottom: 1, top: 1 }}
                        accessibilityRole="button"
                        accessibilityState={{ busy: line.card.waiting, disabled: line.card.busy }}
                        disabled={line.card.busy}
                        onPress={line.card.onYes}
                        style={({ pressed }) => [styles.choice, line.card?.busy && styles.off, pressed && styles.choicePressed]}
                      >
                        {line.card.waiting ? (
                          <ActivityIndicator color={colors.onPrimary} size="small" />
                        ) : (
                          <Text style={[styles.choiceText, styles.onText]}>이대로 조정</Text>
                        )}
                      </Pressable>
                    </View>
                  ) : null}
                  {line.note ? <Text style={styles.after}>{line.note}</Text> : null}
                </View>
              </View>
            ),
          )}
          {waiting ? (
            <View style={styles.answer}>
              {face}
              <View accessibilityLabel="답을 쓰고 있어요" accessible style={[styles.say, styles.dots]}>
                <View style={styles.sayTail} />
                {[0, 1, 2].map((dot) => (
                  <View key={dot} style={[styles.dot, { opacity: step % 3 === dot ? 1 : 0.25 }]} />
                ))}
              </View>
            </View>
          ) : null}
          {error ? (
            <Text accessibilityRole="alert" style={styles.fail}>
              {error}
            </Text>
          ) : null}
        </ScrollView>
      ) : (
        <>
          <View onLayout={(event) => setRoom(event.nativeEvent.layout.height)} style={styles.hello}>
            {room > 0 ? (
              <>
                <View style={styles.greet}>
                  <Text style={styles.greetText}>{greeting}</Text>
                  <View style={styles.greetTail} />
                </View>
                <View style={styles.stand}>
                  {/* At its full size where there is room for it, half of it on a short screen. */}
                  <Hero frame={1} proud tier={tier} who={who} zoom={room >= 370 ? 2 : 1} />
                  <View style={styles.shadow} />
                </View>
              </>
            ) : null}
          </View>
          <View style={styles.asks}>
            {prompts.map((prompt) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !canType }}
                disabled={!canType}
                key={prompt}
                onPress={() => onSend(prompt)}
                style={({ pressed }) => [styles.ask, pressed && styles.askPressed]}
              >
                <Text style={styles.words}>{prompt}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      <View style={[styles.foot, { paddingBottom: Math.max(12, insets.bottom) }]}>
        {talking ? (
          <View style={styles.quick}>
            {prompts.slice(0, 2).map((prompt) => (
              <Pressable hitSlop={{ bottom: 5, top: 5 }}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canType }}
                disabled={!canType}
                key={prompt}
                onPress={() => onSend(prompt)}
                style={styles.mini}
              >
                <Text style={styles.miniText}>{prompt}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={styles.send}>
          <TextInput
            accessibilityLabel="물어볼 말"
            editable={canType}
            maxLength={500}
            onChangeText={onDraft}
            onSubmitEditing={() => onSend()}
            placeholder="무엇이 궁금해요?"
            placeholderTextColor={colors.textSecondary}
            returnKeyType="send"
            style={styles.input}
            value={draft}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSend }}
            disabled={!canSend}
            onPress={() => onSend()}
            style={({ pressed }) => [styles.go, !canSend && styles.off, pressed && styles.goPressed]}
          >
            <Text style={[styles.choiceText, styles.onText]}>보내기</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// The box that changes how the character talks: the three ways, each with the sentence it opens with.
export function ToneSheet<Id extends string>({
  visible,
  chosen,
  tones,
  onClose,
  onPick,
}: {
  visible: boolean;
  chosen: Id;
  tones: { id: Id; name: string; first: string }[];
  onClose: () => void;
  onPick: (id: Id) => void;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <AppBottomSheet contentStyle={styles.tones} onClose={onClose} title="말투" visible={visible}>
      {tones.map((tone) => (
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: tone.id === chosen }}
          key={tone.id}
          onPress={() => onPick(tone.id)}
          style={[styles.tone, tone.id === chosen && styles.toneOn]}
        >
          <Text style={styles.words}>{tone.name}</Text>
          <Text style={styles.toneFirst}>{tone.first}</Text>
        </Pressable>
      ))}
      <Text style={styles.toneNote}>말투만 다르고 알려 주는 내용은 같아요</Text>
    </AppBottomSheet>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  const bubble = { borderRadius: 14, paddingHorizontal: 13, paddingVertical: 8 } as const;
  // The small corner that makes a box something said: a square turned on its point, two of its sides drawn.
  const tail = { backgroundColor: colors.surface, borderColor: colors.border, height: 10, position: 'absolute', transform: [{ rotate: '45deg' }], width: 10 } as const;
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, paddingHorizontal: 16, width: '100%' },
    bar: { alignItems: 'center', flexDirection: 'row', gap: 10, height: 52 },
    back: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 14,
      borderWidth: 1,
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    backPressed: { transform: [{ translateY: 4 }] },
    title: { color: colors.textPrimary, flex: 1, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 24, lineHeight: 28 },
    mini: a.mini,
    miniText: a.miniText,
    note: { ...a.note, marginTop: 6, textAlign: 'center' },
    // ---- before the first question ----
    hello: { alignItems: 'center', flex: 1, gap: 16, justifyContent: 'center', minHeight: 0 },
    greet: { ...bubble, backgroundColor: colors.surface, maxWidth: 250 },
    greetText: { ...a.p15, color: colors.textPrimary, textAlign: 'center' },
    greetTail: { ...tail, alignSelf: 'center', borderBottomWidth: 2, borderRightWidth: 2, bottom: -7 },
    stand: { alignItems: 'center' },
    shadow: { backgroundColor: 'rgba(32, 35, 63, 0.16)', borderRadius: 99, height: 10, marginTop: -6, width: 100, zIndex: -1 },
    asks: { gap: 6 },
    ask: { backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
    askPressed: { backgroundColor: colors.surfaceMuted },
    // ---- the talk: the newest line sits just above the field, older ones go up and out under the line ----
    talkBox: { borderTopColor: colors.surfaceMuted, borderTopWidth: 2, flex: 1, marginTop: 10 },
    talk: { flexGrow: 1, gap: 16, justifyContent: 'flex-end', paddingBottom: 12, paddingTop: 14 },
    mine: { ...bubble, alignSelf: 'flex-end', backgroundColor: colors.surfaceMuted, maxWidth: '80%', paddingVertical: 9 },
    words: { ...a.p15, color: colors.textPrimary },
    answer: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, maxWidth: '96%' },
    face: {
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 11,
      borderWidth: 1,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    answerColumn: { flexShrink: 1 },
    say: { ...bubble, backgroundColor: colors.surface },
    sayTail: { ...tail, borderBottomWidth: 2, borderLeftWidth: 2, left: -7, top: 13 },
    duo: { flexDirection: 'row', gap: 8, marginTop: 10, paddingBottom: 4 },
    choice: { ...a.go, flex: 1, height: 42 },
    choiceNo: a.goGhost,
    choicePressed: a.goPressed,
    choiceText: { ...a.p15, color: colors.textPrimary },
    onText: a.onText,
    off: { opacity: 0.4 },
    after: { ...a.note, marginHorizontal: 2, marginTop: 8 },
    dots: { alignItems: 'center', flexDirection: 'row', gap: 5, paddingVertical: 14 },
    dot: { backgroundColor: colors.textSecondary, height: 8, width: 8 },
    fail: { ...a.note, alignSelf: 'center', textAlign: 'center' },
    // ---- type and send ----
    foot: { paddingTop: 12 },
    quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10, paddingBottom: 3 },
    send: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
    input: { ...a.field, ...a.input, flex: 1, height: 46, minWidth: 0 },
    go: { ...a.go, height: 46, paddingHorizontal: 14 },
    goPressed: a.goPressed,
    // ---- the box of the three ways of talking ----
    tones: { gap: 8, paddingBottom: 24, paddingHorizontal: 16, paddingTop: 0 },
    tone: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1,
      gap: 2,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    toneOn: { backgroundColor: colors.surfaceMuted },
    toneFirst: a.note,
    toneNote: { ...a.note, marginHorizontal: 4, marginTop: 4 },
  } as const;
}
