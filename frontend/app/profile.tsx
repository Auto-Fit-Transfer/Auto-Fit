import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Back from '@/assets/figma/main/a08ac.svg';
import { getProfile, updateProfile, type Profile } from '@/src/api/home';
import { getCommunityProfile, type CommunityProfile } from '@/src/api/community';
import { getApiErrorMessage } from '@/src/api/client';
import { CommunityAvatar } from '@/src/components/community';
import { BirthDatePicker } from '@/src/components/auth';
import { colors, fontFamilies } from '@/src/theme';

function validBirthDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00');
  const localValue = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
  return !Number.isNaN(date.getTime()) && localValue === value && date <= new Date();
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<Profile>({});
  const [community, setCommunity] = useState<CommunityProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [pickerVisible, setPickerVisible] = useState(false);

  useEffect(() => {
    let live = true;
    void getProfile()
      .then((response) => {
        if (!live) return;
        setProfile(response.profile ?? {});
        setLoaded(true);
        setError('');
      })
      .catch((cause) => { if (live) setError(getApiErrorMessage(cause)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [attempt]);

  useFocusEffect(useCallback(() => {
    let live = true;
    void getCommunityProfile('me')
      .then((value) => { if (live) setCommunity(value); })
      .catch(() => {});
    return () => { live = false; };
  }, []));

  const edit = (value: Partial<Profile>) => {
    setProfile((current) => ({ ...current, ...value }));
    setSaved(false);
    setError('');
  };

  const save = async () => {
    const name = profile.name?.trim() ?? '';
    const nickname = profile.nickname?.trim() ?? '';
    if (!name) return setError('이름을 입력해 주세요.');
    if (nickname && (nickname.length < 2 || nickname.length > 30)) {
      return setError('닉네임은 2~30자로 입력해 주세요.');
    }
    if (profile.birth_date && !validBirthDate(profile.birth_date)) {
      return setError('올바른 생년월일을 선택해 주세요.');
    }
    setSaving(true);
    setError('');
    try {
      const response = await updateProfile({
        name,
        nickname: nickname || null,
        ...(profile.bio !== undefined ? { bio: profile.bio?.trim() || null } : {}),
        birth_date: profile.birth_date || null,
        gender: profile.gender || null,
      });
      setProfile(response.profile ?? { ...profile, name, nickname });
      setSaved(true);
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 110 }]}
      >
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()} style={styles.back}>
            <Back />
          </Pressable>
          <Text style={styles.title}>프로필 수정</Text>
          <View style={styles.back} />
        </View>
        {loading ? (
          <Text style={styles.message}>프로필을 불러오는 중이에요.</Text>
        ) : (
          <>
            <View style={styles.avatarBlock}>
              <CommunityAvatar
                author={{ user_id: community?.user_id ?? 'me', nickname: profile.nickname || profile.name || '회원', profile_image_url: community?.profile_image_url ?? null }}
                size={90}
              />
              <Text style={styles.avatarCaption}>프로필 사진</Text>
              <Text style={styles.helper}>사진 변경은 공개 범위를 정한 뒤 제공될 예정이에요.</Text>
            </View>
            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={styles.label}>이름</Text>
                <TextInput accessibilityLabel="이름" maxLength={50} value={profile.name ?? ''} onChangeText={(name) => edit({ name })} style={styles.input} />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>닉네임</Text>
                <TextInput
                  accessibilityLabel="닉네임"
                  autoCapitalize="none"
                  maxLength={30}
                  placeholder="닉네임을 입력해 주세요"
                  placeholderTextColor={colors.textDisabled}
                  value={profile.nickname ?? ''}
                  onChangeText={(nickname) => edit({ nickname })}
                  style={styles.input}
                />
                <Text style={styles.helper}>2~30자 · 현재 서버에서 지원하는 길이</Text>
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>자기소개 <Text style={styles.optional}>선택</Text></Text>
                {profile.bio === undefined ? (
                  <View style={[styles.input, styles.unavailable]}><Text style={styles.helper}>서버 연결 후 자기소개를 수정할 수 있어요.</Text></View>
                ) : <>
                <TextInput
                  accessibilityLabel="자기소개"
                  maxLength={50}
                  onChangeText={(bio) => edit({ bio })}
                  placeholder="운동 목표나 좋아하는 운동을 적어 보세요"
                  placeholderTextColor={colors.textDisabled}
                  style={styles.input}
                  value={profile.bio ?? ''}
                />
                <Text style={styles.helper}>커뮤니티 프로필에 보여요 · {(profile.bio ?? '').length}/50</Text>
                </>}
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>생년월일</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="생년월일 선택" onPress={() => setPickerVisible(true)} style={styles.input}>
                  <Text style={profile.birth_date ? styles.inputText : styles.helper}>
                    {profile.birth_date?.replace(/-/g, '.') ?? '생년월일을 선택해 주세요'}
                  </Text>
                </Pressable>
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>성별</Text>
                <View style={styles.genderRow}>
                  {([
                    ['male', '남성'],
                    ['female', '여성'],
                    ['other', '기타'],
                  ] as const).map(([value, label]) => (
                    <Pressable
                      key={value}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: profile.gender === value }}
                      onPress={() => edit({ gender: value })}
                      style={[styles.gender, profile.gender === value && styles.genderSelected]}
                    >
                      <Text style={[styles.genderText, profile.gender === value && styles.genderTextSelected]}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>키 · 몸무게</Text>
                <Pressable accessibilityRole="button" onPress={() => router.push('/health-data-management')} style={styles.healthLink}>
                  <Text style={styles.healthLinkText}>건강 데이터에서 확인하기</Text>
                  <Text style={styles.helper}>검진·체성분 기록으로 관리해요  ›</Text>
                </Pressable>
              </View>
            </View>
          </>
        )}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {!loaded && !loading ? (
          <Pressable accessibilityRole="button" onPress={() => { setLoading(true); setAttempt((value) => value + 1); }} style={styles.retry}>
            <Text style={styles.retryText}>다시 불러오기</Text>
          </Pressable>
        ) : null}
        {saved ? <Text accessibilityRole="alert" style={styles.success}>프로필을 저장했어요.</Text> : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: loading || saving || !loaded }}
          disabled={loading || saving || !loaded}
          onPress={() => void save()}
          style={[styles.save, (loading || saving || !loaded) && styles.saveDisabled]}
        >
          <Text style={styles.saveText}>{saving ? '저장 중…' : '저장하기'}</Text>
        </Pressable>
      </View>
      <BirthDatePicker
        maximumDate={new Date()}
        value={profile.birth_date && validBirthDate(profile.birth_date) ? new Date(profile.birth_date + 'T00:00:00') : new Date(2000, 0, 1)}
        onCancel={() => setPickerVisible(false)}
        onConfirm={(date) => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          edit({ birth_date: [year, month, day].join('-') });
          setPickerVisible(false);
        }}
        visible={pickerVisible}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 22 },
  header: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 32, minHeight: 32, justifyContent: 'center' },
  title: { fontFamily: fontFamilies.pretendardSemiBold, color: colors.textPrimary, fontSize: 17 },
  avatarBlock: { alignItems: 'center', marginTop: 28, marginBottom: 32, gap: 8 },
  avatarCaption: { fontFamily: fontFamilies.pretendardSemiBold, color: colors.textPrimary, fontSize: 14 },
  form: { gap: 22 },
  field: { gap: 9 },
  label: { fontFamily: fontFamilies.pretendardSemiBold, fontSize: 14, color: colors.textPrimary },
  optional: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center', fontSize: 15, color: colors.textPrimary, backgroundColor: colors.surface },
  inputText: { fontSize: 15, color: colors.textPrimary },
  helper: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
  unavailable: { backgroundColor: colors.background, justifyContent: 'center' },
  genderRow: { flexDirection: 'row', gap: 9 },
  gender: { flex: 1, height: 45, borderWidth: 1, borderColor: colors.border, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  genderSelected: { borderColor: colors.primaryDark, backgroundColor: colors.surfaceSoft },
  genderText: { fontSize: 14, color: colors.textSecondary },
  genderTextSelected: { color: colors.primaryDark, fontFamily: fontFamilies.pretendardSemiBold },
  healthLink: { minHeight: 60, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10, gap: 4 },
  healthLinkText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardSemiBold },
  message: { color: colors.textSecondary, marginTop: 30 },
  error: { color: colors.danger, marginTop: 18 },
  success: { color: colors.success, marginTop: 18 },
  retry: { paddingVertical: 14 },
  retryText: { color: colors.primaryDark },
  footer: { borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 22, paddingTop: 12 },
  save: { height: 54, borderRadius: 10, backgroundColor: colors.primaryDark, alignItems: 'center', justifyContent: 'center' },
  saveDisabled: { opacity: 0.45 },
  saveText: { fontFamily: fontFamilies.pretendardSemiBold, color: colors.surface, fontSize: 16 },
});
