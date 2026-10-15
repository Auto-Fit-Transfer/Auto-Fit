import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Avatar from '@/assets/figma/main/143da.svg';
import { getProfile, updateProfile, type Profile } from '@/src/api/home';
import { getApiErrorMessage } from '@/src/api/client';
import { MainHeader, MainScreen, mainStyles } from '@/src/components/main/MainSurface';
import { FormField, form } from '@/src/components/main/FormControls';
import { colors, fontFamilies } from '@/src/theme';
export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    void getProfile()
      .then((r) => {
        if (live) {
          setProfile(r.profile ?? {});
          setLoaded(true);
          setError('');
        }
      })
      .catch((e) => {
        if (live) setError(getApiErrorMessage(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [attempt]);
  const edit = (patch: Partial<Profile>) => {
    setProfile((p) => ({ ...p, ...patch }));
    setSaved(false);
  };
  const save = async () => {
    if (!profile.name?.trim()) {
      setError('이름을 입력해 주세요.');
      return;
    }
    if (
      profile.birth_date &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(profile.birth_date) ||
        Number.isNaN(Date.parse(profile.birth_date)) ||
        new Date(profile.birth_date) > new Date())
    ) {
      setError('생년월일을 YYYY-MM-DD 형식의 지난 날짜로 입력해 주세요.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updateProfile({
        name: profile.name.trim(),
        nickname: profile.nickname?.trim() || null,
        birth_date: profile.birth_date || null,
        gender: profile.gender || null,
      });
      setSaved(true);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <MainScreen tabs={false}>
      <MainHeader title="프로필 편집" height={200} back={() => router.back()}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 100, height: 100, alignItems: 'center', justifyContent: 'center' }}>
            <Avatar />
            <Image
              source={require('@/assets/figma/main/5cb64.png')}
              style={{ position: 'absolute', width: 70, height: 70 }}
            />
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 30,
                color: colors.primaryLight,
                fontFamily: fontFamilies.pretendardSemiBold,
              }}
            >
              {profile.name || '회원'}님
            </Text>
            <Text style={{ color: colors.textWhiteSecondary, fontSize: 14 }}>
              프로필 정보를 수정할 수 있어요.
            </Text>
          </View>
        </View>
      </MainHeader>
      <View style={[mainStyles.content, { marginTop: 50 }]}>
        <Text style={mainStyles.sectionTitle}>기본 정보</Text>
        {loading ? (
          <Text style={mainStyles.text}>프로필을 불러오는 중이에요.</Text>
        ) : (
          <View style={[mainStyles.card, { gap: 18 }]}>
            <FormField
              label="이름"
              maxLength={50}
              value={profile.name ?? ''}
              onChangeText={(name) => edit({ name })}
            />
            <FormField
              label="닉네임"
              maxLength={30}
              value={profile.nickname ?? ''}
              onChangeText={(nickname) => edit({ nickname })}
            />
            <Text style={form.label}>성별</Text>
            <View style={form.row}>
              {(
                [
                  { id: 'male', label: '남성' },
                  { id: 'female', label: '여성' },
                  { id: 'other', label: '기타' },
                ] as const
              ).map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: profile.gender === item.id }}
                  onPress={() => edit({ gender: item.id })}
                  style={[form.chip, profile.gender === item.id && form.selected]}
                >
                  <Text style={mainStyles.text}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
            <FormField
              label="생년월일"
              placeholder="YYYY-MM-DD"
              maxLength={10}
              value={profile.birth_date ?? ''}
              onChangeText={(birth_date) => edit({ birth_date })}
            />
          </View>
        )}
        <Text style={mainStyles.sectionTitle}>신체 정보</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/health-data-management')}
          style={mainStyles.card}
        >
          <Text style={mainStyles.text}>
            키와 현재 체중은 업로드한 검진·체성분 결과에서 관리해요. ›
          </Text>
        </Pressable>
        {error ? (
          <Text accessibilityRole="alert" style={form.error}>
            {error}
          </Text>
        ) : null}
        {!loaded && !loading ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setLoading(true);
              setAttempt((v) => v + 1);
            }}
          >
            <Text style={form.label}>다시 불러오기</Text>
          </Pressable>
        ) : null}
        {saved ? <Text style={form.success}>프로필을 저장했어요.</Text> : null}
        <Pressable
          accessibilityRole="button"
          disabled={loading || saving || !loaded}
          onPress={() => void save()}
          style={[mainStyles.button, (loading || saving || !loaded) && { opacity: 0.5 }]}
        >
          <Text style={mainStyles.buttonText}>{saving ? '저장 중…' : '변경 내용 저장'}</Text>
        </Pressable>
      </View>
    </MainScreen>
  );
}
