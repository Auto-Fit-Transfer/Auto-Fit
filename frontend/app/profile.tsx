import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import CalendarIcon from '@/assets/icons/ui/calendar-check.svg';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import UserIcon from '@/assets/icons/ui/user.svg';
import { getProfile, updateProfile, type Profile } from '@/src/api/home';
import { getApiErrorMessage } from '@/src/api/client';
import { BirthDatePicker } from '@/src/components/auth';
import { AppButton, AppTextField, Notice, SelectField, Text } from '@/src/components/common';
import { ChoiceChips, ChoiceSection } from '@/src/components/exercise/ExerciseFormParts';
import { SubScreen } from '@/src/components/navigation';
import { radius, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

const genderOptions = [
  { value: 'male', label: '남성' },
  { value: 'female', label: '여성' },
  { value: 'other', label: '기타' },
] as const;

function toDate(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00`) : undefined;
}

function toApiDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

// Figma G2. A photo and a self introduction wait for the server; height and weight come from the
// uploaded health data.
export default function ProfileScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [profile, setProfile] = useState<Profile>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [pickerVisible, setPickerVisible] = useState(false);

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

  const birthday = toDate(profile.birth_date);

  return (
    <SubScreen
      footer={
        !loaded && !loading ? (
          <AppButton
            onPress={() => {
              setLoading(true);
              setAttempt((v) => v + 1);
            }}
            title="다시 불러오기"
            variant="secondary"
          />
        ) : (
          <AppButton
            disabled={loading || !loaded}
            loading={saving}
            onPress={() => void save()}
            title="저장하기"
          />
        )
      }
      gap={20}
      onBack={() => router.back()}
      title="프로필 수정"
    >
      <View style={styles.avatar}>
        <UserIcon color={colors.textSecondary} height={40} width={40} />
      </View>
      <AppTextField
        label="이름"
        maxLength={50}
        onChangeText={(name) => edit({ name })}
        placeholder="이름"
        value={profile.name ?? ''}
      />
      <AppTextField
        helperText="커뮤니티에서 보이는 이름이에요."
        label="닉네임"
        maxLength={30}
        onChangeText={(nickname) => edit({ nickname })}
        placeholder="닉네임"
        value={profile.nickname ?? ''}
      />
      <SelectField
        accessibilityLabel="생년월일 고르기"
        label="생년월일"
        onPress={() => setPickerVisible(true)}
        placeholder="생년월일을 골라 주세요"
        rightElement={<CalendarIcon color={colors.textSecondary} height={22} width={22} />}
        value={profile.birth_date ? profile.birth_date.replaceAll('-', '. ') : undefined}
      />
      <ChoiceSection title="성별">
        <ChoiceChips
          isSelected={(value) => profile.gender === value}
          onSelect={(gender) => edit({ gender })}
          options={genderOptions}
        />
      </ChoiceSection>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/health-data-management')}
        style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
      >
        <View style={styles.flex}>
          <Text style={styles.strong}>키 · 몸무게</Text>
          <Text style={styles.caption}>올린 검진표 · 인바디 결과에서 관리해요</Text>
        </View>
        <CaretRightIcon color={colors.textSecondary} height={20} width={20} />
      </Pressable>
      {error ? <Notice body={error} tone="warning" /> : null}
      {saved ? <Notice body="프로필을 저장했어요." /> : null}
      <BirthDatePicker
        maximumDate={new Date()}
        onCancel={() => setPickerVisible(false)}
        onConfirm={(date) => {
          edit({ birth_date: toApiDate(date) });
          setPickerVisible(false);
        }}
        value={birthday ?? new Date(2000, 0, 1)}
        visible={pickerVisible}
      />
    </SubScreen>
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    flex: { flex: 1, gap: 2 },
    avatar: {
      alignItems: 'center',
      alignSelf: 'center',
      backgroundColor: colors.surfaceMuted,
      borderRadius: 44,
      height: 88,
      justifyContent: 'center',
      width: 88,
    },
    strong: { ...text.body1Strong, color: colors.textPrimary },
    caption: { ...text.caption, color: colors.textSecondary },
    linkRow: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.button,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 12,
      padding: 16,
    },
    pressed: { opacity: 0.75 },
  } as const;
}
