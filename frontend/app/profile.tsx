import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { koreanDate } from '@/src/lib/koreanDate';
import CalendarIcon from '@/assets/icons/ui/calendar-check.svg';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { getProfile, updateProfile, type Profile } from '@/src/api/home';
import { getCommunityProfile, type CommunityProfile } from '@/src/api/community';
import { getApiErrorMessage } from '@/src/api/client';
import { CommunityAvatar } from '@/src/components/community';
import { BirthDatePicker } from '@/src/components/auth';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { aForm } from '@/src/components/a/form';
import { Text, TextInput } from '@/src/components/common';

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
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
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
      <ScreenHeader onBack={() => router.back()} title="프로필 수정" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: 8, paddingBottom: insets.bottom + 110 }]}
      >
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
              <Text style={styles.helper}>사진 변경은 준비 중이에요.</Text>
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
                <Text style={styles.helper}>2~30자로 입력해 주세요</Text>
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
                <Pressable accessibilityRole="button" accessibilityLabel="생년월일 선택" onPress={() => setPickerVisible(true)} style={[styles.input, styles.dateInput]}>
                  <Text style={profile.birth_date ? styles.inputText : styles.helper}>
                    {profile.birth_date ? koreanDate(profile.birth_date) : '생년월일을 선택해 주세요'}
                  </Text>
                  <CalendarIcon color={colors.textSecondary} height={20} width={20} />
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
                  <Text style={styles.helper}>검진·체성분 기록으로 관리해요</Text>
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
          <Text style={[styles.saveText, (loading || saving || !loaded) && styles.disabledText]}>{saving ? '저장 중…' : '저장하기'}</Text>
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

function createStyles({ colors }: AppTheme) {
  // Renewal A: my picture on top, then the questions with pixel letters, the one button on its ledge.
  const a = aForm(colors);
  return {
    screen: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    content: { paddingHorizontal: 16 },
    avatarBlock: { alignItems: 'center', gap: 6, marginBottom: 22, marginTop: 16 },
    avatarCaption: { ...a.p15, color: colors.ink },
    form: { gap: 18 },
    field: { gap: 8 },
    label: { ...a.q, marginBottom: 0 },
    optional: { color: colors.textSecondary },
    input: { backgroundColor: colors.surface, borderColor: colors.ink, borderRadius: 12, borderWidth: 2, color: colors.ink, fontFamily: fontFamilies.galmuri14, fontSize: 15, justifyContent: 'center', minHeight: 48, paddingHorizontal: 12 },
    dateInput: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    inputText: { ...a.p15, color: colors.ink },
    helper: a.note,
    unavailable: { backgroundColor: colors.surfaceMuted },
    genderRow: { flexDirection: 'row', gap: 8 },
    gender: a.seg,
    genderSelected: a.segOn,
    genderText: a.segText,
    genderTextSelected: a.onText,
    healthLink: { ...a.card, gap: 2, padding: 14 },
    healthLinkText: { ...a.p15, color: colors.ink },
    message: { ...a.p15, color: colors.textBody, marginTop: 30 },
    error: { ...a.p12, color: colors.danger, marginTop: 14 },
    success: { ...a.p12, color: colors.success, marginTop: 14 },
    retry: { paddingVertical: 14 },
    retryText: a.link,
    footer: { backgroundColor: colors.background, paddingHorizontal: 16, paddingTop: 12 },
    save: a.go,
    saveDisabled: { ...a.goOff, boxShadow: '0 0 0 rgba(32, 35, 63, 0.3)' },
    disabledText: { color: colors.textDisabled },
    saveText: a.goText,
  } as const;
}
