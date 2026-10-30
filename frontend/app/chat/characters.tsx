import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatCharacterAvatar } from '@/src/components/chat/ChatCharacterAvatar';
import { chatCharacters, getChatCharacter, loadChatCharacter, saveChatCharacter, type ChatCharacterId } from '@/src/features/chat/chatCharacters';
import { fontFamilies } from '@/src/theme';

export default function ChatCharactersScreen() {
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
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 8, paddingBottom: 18 }]}>
        <View style={s.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="뒤로 가기" onPress={() => router.back()}><Text style={s.back}>‹</Text></Pressable>
          <Text style={s.headerTitle}>대화 상대 고르기</Text><View style={s.spacer} />
        </View>
        <Text style={s.title}>누구와 이야기할까요?</Text>
        <Text style={s.description}>마음에 드는 캐릭터를 골라주세요. 선택한 상대의 말투와 상황에 맞는 표정으로 답해요. 선택은 이 기기에 저장돼요.</Text>
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
              </View>
              <View style={[s.radio, selected === character.id && s.radioSelected]}>
                {selected === character.id ? <Text style={s.check}>✓</Text> : null}
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <View style={[s.bottom, { paddingBottom: Math.max(12, insets.bottom) }]}>
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={[s.primaryButton, saving && s.disabled]}>
          <Text style={s.primaryText}>{getChatCharacter(selected).name}와 이야기하기</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { backgroundColor: '#FFF', flex: 1 }, content: { paddingHorizontal: 20, gap: 18 },
  header: { height: 44, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { fontSize: 32, color: '#25242B', width: 30 }, headerTitle: { color: '#25242B', fontSize: 15, fontFamily: fontFamilies.pretendardBold },
  spacer: { width: 30 }, title: { color: '#25242B', fontSize: 22, fontFamily: fontFamilies.pretendardBold },
  description: { color: '#777681', fontSize: 13, lineHeight: 20, marginTop: -8 },
  list: { gap: 10 }, card: { minHeight: 84, borderWidth: 1, borderColor: '#E3E4EA', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FAFAFC' },
  selectedCard: { borderColor: '#503DD7', borderWidth: 1.5 },
  copy: { flex: 1, gap: 4 }, name: { color: '#25242B', fontSize: 14, fontFamily: fontFamilies.pretendardBold },
  role: { color: '#777681', fontSize: 10, fontFamily: fontFamilies.pretendardRegular },
  cardDescription: { color: '#777681', fontSize: 11, lineHeight: 16 },
  radio: { width: 21, height: 21, borderRadius: 11, borderWidth: 1, borderColor: '#C4C5CB', alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: '#503DD7', backgroundColor: '#503DD7' }, check: { color: '#FFF', fontSize: 12 },
  bottom: { borderTopWidth: 1, borderTopColor: '#E8E8ED', paddingHorizontal: 20, paddingTop: 12, backgroundColor: '#FFF' },
  primaryButton: { backgroundColor: '#503DD7', borderRadius: 9, height: 50, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFF', fontSize: 14, fontFamily: fontFamilies.pretendardBold }, disabled: { opacity: 0.5 },
});
