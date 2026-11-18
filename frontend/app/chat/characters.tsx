import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CheckIcon from '@/assets/icons/ui/check.svg';
import { ChatCharacterAvatar } from '@/src/components/chat/ChatCharacterAvatar';
import { chatCharacters, getChatCharacter, loadChatCharacter, saveChatCharacter, type ChatCharacterId } from '@/src/features/chat/chatCharacters';
import { aForm } from '@/src/components/a/form';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';

const samples: Record<ChatCharacterId, string> = {
  quni: '3일 동안 쉬었네요. 괜찮아요, 천천히 같이 해요. 오늘은 10분 걷기부터 어때요?',
  nabi: '흠, 3일째 조용하네. 뭐… 쉴 수도 있지. 오늘은 10분만 움직여.',
  coach: '3일 쉬었습니다. 핑계 금지. 스쿼트 30개, 지금 바로. 끝나면 한 세트 더.',
};

export default function ChatCharactersScreen() {
  const { colors } = useAppTheme();
  const s = useThemedStyles(createSStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<ChatCharacterId>('quni');
  const [saving, setSaving] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    void loadChatCharacter().then((character) => { if (active) setSelected(character.id); });
    return () => { active = false; };
  }, []));
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveChatCharacter(selected);
      router.back();
    } catch {
      Alert.alert('선택을 저장하지 못했어요', '잠시 후 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <View style={s.root}>
      <ScreenHeader onBack={() => router.back()} title="대화 상대 고르기" />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: 18 }]} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>누구와 이야기할까요?</Text>
        <Text style={s.description}>말투만 다르고 알려 주는 내용은 같아요.</Text>
        <Text style={s.sampleLabel}>같은 질문 “3일째 운동을 못 했어요”</Text>
        <View style={s.list}>
          {chatCharacters.map((character) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: selected === character.id, disabled: saving }}
              key={character.id}
              onPress={() => setSelected(character.id)}
              style={[s.card, selected === character.id && s.selectedCard]}
            >
              <ChatCharacterAvatar characterId={character.id} size={48} variant={1} />
              <View style={s.copy}>
                <Text style={s.name}>{character.name} <Text style={s.role}>{character.role}</Text></Text>
                <Text style={s.cardDescription}>{character.description}</Text>
                <Text style={s.sample}>{samples[character.id]}</Text>
              </View>
              <View style={[s.radio, selected === character.id && s.radioSelected]}>
                {selected === character.id ? <CheckIcon color={colors.onPrimary} height={14} width={14} /> : null}
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <View style={[s.bottom, { paddingBottom: Math.max(12, insets.bottom) }]}>
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={({ pressed }) => [s.primaryButton, saving && s.disabled, pressed && s.pressed]}>
          <Text style={[s.primaryText, saving && s.disabledText]}>{getChatCharacter(selected).name}와 이야기하기</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createSStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    content: { gap: 12, paddingHorizontal: 16, paddingTop: 8 },
    title: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, lineHeight: 30 },
    description: { ...a.p15, color: colors.ink },
    sampleLabel: a.note,
    list: { gap: 12 },
    card: { ...a.card, alignItems: 'flex-start', flexDirection: 'row', gap: 12, padding: 14 },
    // the one chosen: violet ground, the full dark ledge
    selectedCard: { backgroundColor: colors.primaryLight, boxShadow: `0 4px 0 ${colors.ink}` },
    copy: { flex: 1, gap: 2, minWidth: 0 },
    name: { ...a.p15, color: colors.ink },
    role: a.note,
    cardDescription: { ...a.p12, color: colors.textBody },
    sample: { ...a.p12, color: colors.ink, marginTop: 2 },
    radio: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.ink, borderRadius: 8, borderWidth: 2, height: 26, justifyContent: 'center', width: 26 },
    radioSelected: { backgroundColor: colors.primary },
    bottom: { backgroundColor: colors.background, paddingHorizontal: 16, paddingTop: 8 },
    primaryButton: { ...a.go, height: 52 },
    primaryText: { ...a.goText, fontSize: 20, lineHeight: 24 },
    disabled: a.goOff,
    disabledText: { color: colors.textDisabled },
    pressed: a.goPressed,
  } as const;
}
