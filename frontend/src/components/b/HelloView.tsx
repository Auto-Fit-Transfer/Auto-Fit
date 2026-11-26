import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AutofitWordmark from '@/assets/icons/autofit-wordmark.svg';
import CheckIcon from '@/assets/icons/system/Check.svg';
import ArrowUpIcon from '@/assets/icons/common/chevrons/Up.svg';
import { ChatCharacterAvatar } from '@/src/components/chat/ChatCharacterAvatar';
import { Text, TextInput } from '@/src/components/common';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { Headline } from './Headline';

// Renewal B's first screen, the one-sentence sign-up (b-start.html): the black card greets me and asks who
// I am in one sentence (open); the words it took light up and one line a thing says what it set up, asking
// only for what it did not hear (heard); then the day is ready and the account comes last (keep).
// app/(auth)/login.tsx fills it; app/dev/b-hello.tsx with samples.
export type HelloLineKey = 'who' | 'food' | 'plan' | 'body';
export interface HelloLine {
  key: HelloLineKey;
  done: string | null; // what it set up; null = not heard yet
  missing: string; // said when nothing was heard
}

export interface HelloViewProps {
  phase: 'open' | 'heard' | 'keep';
  input: string;
  example: string;
  said: { text: string; marks: [number, number][] } | null; // null: chosen by hand (직접 고를게요)
  lines: HelloLine[];
  onInput: (text: string) => void;
  onSay: () => void;
  onExample: () => void;
  onPick: () => void; // 직접 고를게요
  onLogin: () => void;
  onAsk: (key: HelloLineKey) => void;
  onAgain: () => void; // 다시 말할게요 / 말로 할게요
  onGo: () => void; // every line done
  onAccount: () => void;
  onBack: () => void; // keep → heard
}

export function HelloView(props: HelloViewProps) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const whole = props.lines.every((line) => line.done);
  const heardLines = props.lines.filter((line) => line.done).length;

  const marked = props.said ? splitMarks(props.said.text, props.said.marks) : [];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.top}>
          <AutofitWordmark accessibilityLabel="autofit" height={24} width={88} />
          {props.phase === 'open' ? (
            <Pressable accessibilityRole="button" hitSlop={14} onPress={props.onLogin}>
              <Text style={styles.link}>로그인</Text>
            </Pressable>
          ) : null}
        </View>

        {props.phase === 'open' ? (
          <View style={styles.group}>
            <Headline lines={[[{ text: '알아서 해 두고,' }], [{ text: '나는 확인만' }]]} />
            <View style={styles.ai}>
              <View style={styles.who}>
                <ChatCharacterAvatar characterId="quni" size={44} />
                <View style={styles.grow}>
                  <Text style={styles.hello}>안녕하세요, 오토핏이에요</Text>
                  <Text style={styles.aiTitle}>어떤 분인지 한마디만 알려 주세요</Text>
                </View>
              </View>
              <View style={styles.talk}>
                <TextInput
                  accessibilityLabel="나에 대해 한마디"
                  multiline
                  onChangeText={props.onInput}
                  placeholder="나이, 못 먹는 음식, 운동 목표를 한 번에"
                  placeholderTextColor={colors.onAiMuted}
                  style={styles.talkInput}
                  value={props.input}
                />
                <Pressable hitSlop={{ bottom: 2, left: 2, right: 2, top: 2 }}
                  accessibilityLabel="보내기"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !props.input.trim() }}
                  disabled={!props.input.trim()}
                  onPress={props.onSay}
                  style={[styles.send, !props.input.trim() && styles.off]}
                >
                  <ArrowUpIcon color={colors.aiCard} height={18} width={18} />
                </Pressable>
              </View>
            </View>
            <View style={styles.example}>
              <Text style={styles.small}>이렇게 말해 보세요</Text>
              <Pressable accessibilityRole="button" onPress={props.onExample}>
                <Text style={styles.exampleText}>{props.example}</Text>
              </Pressable>
            </View>
            <Pressable accessibilityRole="button" hitSlop={14} onPress={props.onPick} style={styles.center}>
              <Text style={styles.link}>직접 고를게요</Text>
            </Pressable>
          </View>
        ) : null}

        {props.phase === 'heard' ? (
          <View style={styles.group}>
            <View style={styles.ai}>
              <View style={styles.who}>
                <ChatCharacterAvatar characterId="quni" size={44} />
                <View style={styles.grow}>
                  <Text style={styles.hello}>오토핏</Text>
                  <Text style={styles.aiTitle}>
                    {whole ? '이렇게 준비했어요' : props.said && heardLines ? '빠진 것만 더 알려 주세요' : '하나씩 알려 주세요'}
                  </Text>
                </View>
              </View>
              {props.said ? (
                <Text style={styles.said}>
                  “{marked.map((part, index) =>
                    part.mark ? (
                      <Text key={index} style={styles.mark}>{part.text}</Text>
                    ) : (
                      part.text
                    ),
                  )}”
                </Text>
              ) : null}
              <View style={styles.lines}>
                {props.lines.map((line) => (
                  <View key={line.key} style={styles.line}>
                    <View style={[styles.check, line.done ? styles.checkOn : styles.checkOff]}>
                      {line.done ? <CheckIcon color={colors.aiCard} height={14} width={14} /> : null}
                    </View>
                    <Text style={[styles.lineText, !line.done && styles.lineMissing]}>{line.done ?? line.missing}</Text>
                    <Pressable hitSlop={{ bottom: 5, top: 5 }}
                      accessibilityLabel={`${line.done ?? line.missing} ${line.done ? '고치기' : '알려 주기'}`}
                      accessibilityRole="button"
                      onPress={() => props.onAsk(line.key)}
                      style={[styles.pill, !line.done && styles.pillAsk]}
                    >
                      <Text style={[styles.pillText, !line.done && styles.pillAskText]}>{line.done ? '고치기' : '알려 주기'}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !whole }}
              disabled={!whole}
              onPress={props.onGo}
              style={[styles.go, !whole && styles.goOff]}
            >
              <Text style={[styles.goText, !whole && styles.goOffText]}>맞아요</Text>
            </Pressable>
            <Pressable accessibilityRole="button" hitSlop={14} onPress={props.onAgain} style={styles.center}>
              <Text style={styles.link}>{props.said ? '다시 말할게요' : '말로 할게요'}</Text>
            </Pressable>
          </View>
        ) : null}

        {props.phase === 'keep' ? (
          <View style={styles.group}>
            <Headline lines={[[{ text: '첫날 준비를' }], [{ text: '마쳤어요' }]]} />
            <Text style={styles.line15}>계정을 만들면 이대로 시작해요</Text>
            <Pressable accessibilityRole="button" onPress={props.onAccount} style={styles.go}>
              <Text style={styles.goText}>이메일로 계정 만들기</Text>
            </Pressable>
            <Pressable accessibilityRole="button" hitSlop={14} onPress={props.onBack} style={styles.center}>
              <Text style={styles.link}>준비한 것 다시 보기</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// The sentence cut into plain and heard parts, for the lilac under the heard words.
export function splitMarks(text: string, marks: [number, number][]) {
  const parts: { text: string; mark: boolean }[] = [];
  let at = 0;
  for (const [from, to] of marks) {
    if (from < at) continue;
    if (from > at) parts.push({ text: text.slice(at, from), mark: false });
    parts.push({ text: text.slice(from, to), mark: true });
    at = to;
  }
  if (at < text.length) parts.push({ text: text.slice(at), mark: false });
  return parts;
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { backgroundColor: colors.background, flex: 1 },
    content: { flexGrow: 1, gap: 22, paddingHorizontal: 24 },
    top: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 40 },
    // a short screen sits a little above the middle, as one block (renewal B rule)
    group: { flexGrow: 1, gap: 18, justifyContent: 'center', paddingBottom: '18%' },
    grow: { flex: 1, minWidth: 0 },
    center: { alignItems: 'center', alignSelf: 'center', justifyContent: 'center', minHeight: 40 },
    link: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 14, lineHeight: 20 },
    small: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 18 },
    line15: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 15, lineHeight: 22 },
    off: { opacity: 0.4 },
    ai: { backgroundColor: colors.aiCard, borderRadius: 28, gap: 16, padding: 20 },
    who: { alignItems: 'center', flexDirection: 'row', gap: 12 },
    hello: { color: colors.aiHello, fontFamily: fontFamilies.pretendardBold, fontSize: 13, lineHeight: 18 },
    aiTitle: { color: colors.onAi, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 18, lineHeight: 25 },
    talk: { alignItems: 'flex-end', backgroundColor: colors.aiBar, borderRadius: 22, flexDirection: 'row', gap: 8, padding: 8, paddingLeft: 16 },
    talkInput: { color: colors.onAi, flex: 1, fontSize: 15, lineHeight: 22, maxHeight: 120, minHeight: 40, paddingVertical: 8 },
    send: { alignItems: 'center', backgroundColor: colors.lilac, borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
    example: { gap: 6 },
    exampleText: { color: colors.textPrimary, fontSize: 14.5, lineHeight: 22, textDecorationLine: 'underline' },
    said: { color: colors.onAi, fontSize: 15, lineHeight: 24 },
    mark: { backgroundColor: colors.lilac, color: colors.lilacInk, fontFamily: fontFamilies.pretendardBold },
    lines: { borderTopColor: colors.aiLine, borderTopWidth: 1, gap: 12, paddingTop: 14 },
    line: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 40 },
    check: { alignItems: 'center', borderRadius: 11, height: 22, justifyContent: 'center', width: 22 },
    checkOn: { backgroundColor: colors.lilac },
    checkOff: { borderColor: colors.aiRing, borderWidth: 1.5 },
    lineText: { color: colors.onAi, flex: 1, fontFamily: fontFamilies.pretendardBold, fontSize: 14, lineHeight: 20 },
    lineMissing: { color: colors.onAiMuted, fontFamily: fontFamilies.pretendardRegular },
    pill: { backgroundColor: colors.aiRaised, borderRadius: 999, justifyContent: 'center', minHeight: 34, paddingHorizontal: 14 },
    pillText: { color: colors.onAi, fontFamily: fontFamilies.pretendardBold, fontSize: 12.5, lineHeight: 18 },
    pillAsk: { backgroundColor: colors.lilac },
    pillAskText: { color: colors.lilacInk },
    go: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 999, justifyContent: 'center', minHeight: 54 },
    goOff: { backgroundColor: colors.surfaceMuted },
    goText: { color: colors.onPrimary, fontFamily: fontFamilies.pretendardExtraBold, fontSize: 16, lineHeight: 22 },
    goOffText: { color: colors.textDisabled },
  } as const;
}
