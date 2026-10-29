import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import LockIcon from '@/assets/icons/ui/lock.svg';
import { getSupabaseClient } from '@/src/lib/supabase';
import { apiRequest, getApiErrorMessage } from '@/src/api/client';
import { AppButton, AppDialog, AppTextField, Notice, Text } from '@/src/components/common';
import { SubScreen } from '@/src/components/navigation';
import { radius, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

const providerLabels: Record<string, string> = {
  email: '이메일',
  kakao: '카카오',
  google: 'Google',
};

// Figma G3. Linking another sign-in and the terms pages wait for server support.
export default function Account() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [email, setEmail] = useState('확인 중');
  const [provider, setProvider] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    void getSupabaseClient()
      .auth.getUser()
      .then(({ data, error }) => {
        if (!live) return;
        if (error) {
          setError('로그인 정보를 확인하지 못했어요.');
          return;
        }
        setEmail(data.user?.email ?? '이메일 없음');
        const key = String(data.user?.app_metadata?.provider ?? '');
        setProvider(providerLabels[key] ?? (key || '연결된 계정'));
      });
    return () => {
      live = false;
    };
  }, []);

  const signOut = async () => {
    setBusy(true);
    setError('');
    try {
      const { error } = await getSupabaseClient().auth.signOut();
      if (error) throw error;
      router.replace('/login');
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (confirmation !== '탈퇴' || busy) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest<void>('/api/account', { method: 'DELETE' });
      await getSupabaseClient().auth.signOut({ scope: 'local' });
      router.replace('/login');
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SubScreen gap={24} onBack={() => router.back()} title="계정 설정">
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>로그인 정보</Text>
          <View style={styles.card}>
            <View style={styles.line}>
              <Text style={styles.label}>이메일</Text>
              <Text numberOfLines={1} selectable style={styles.value}>
                {email}
              </Text>
            </View>
            <View style={[styles.line, styles.divider]}>
              <Text style={styles.label}>로그인 방식</Text>
              <Text style={styles.value}>{provider}</Text>
            </View>
          </View>
          <Text style={styles.caption}>이메일과 로그인 방식은 바꿀 수 없어요.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>보안</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/password/forgot')}
            style={({ pressed }) => [styles.card, styles.row, pressed && styles.pressed]}
          >
            <View style={styles.icon}>
              <LockIcon color={colors.textPrimary} height={20} width={20} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.strong}>비밀번호 바꾸기</Text>
              <Text style={styles.caption}>메일로 받은 링크에서 새로 정해요</Text>
            </View>
            <CaretRightIcon color={colors.textSecondary} height={20} width={20} />
          </Pressable>
        </View>

        {error && !confirm ? <Notice body={error} tone="warning" /> : null}

        <View style={styles.bottom}>
          <AppButton
            disabled={busy}
            onPress={() => void signOut()}
            title="로그아웃"
            variant="secondary"
          />
          <AppButton
            labelStyle={styles.withdraw}
            onPress={() => {
              setConfirm(true);
              setConfirmation('');
              setError('');
            }}
            size="M"
            title="회원 탈퇴"
            variant="text"
          />
        </View>
      </SubScreen>

      <AppDialog
        cancelText="취소"
        confirmText={busy ? '처리 중…' : '영구 삭제하고 탈퇴'}
        description="건강 데이터, 식단 · 운동 기록과 계정이 영구 삭제돼요. 되돌릴 수 없어요."
        destructive
        onCancel={() => {
          if (!busy) setConfirm(false);
        }}
        onConfirm={() => void remove()}
        title="정말 탈퇴할까요?"
        visible={confirm}
      >
        <AppTextField
          editable={!busy}
          label="확인하려면 '탈퇴'를 입력해 주세요"
          onChangeText={setConfirmation}
          value={confirmation}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </AppDialog>
    </>
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    flex: { flex: 1, gap: 2 },
    section: { gap: 10 },
    sectionTitle: { ...text.body2Strong, color: colors.textSecondary },
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.card,
      borderWidth: 1,
      paddingHorizontal: 16,
    },
    line: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 16,
      justifyContent: 'space-between',
      minHeight: 56,
    },
    divider: { borderTopColor: colors.border, borderTopWidth: 1 },
    label: { ...text.body2, color: colors.textSecondary },
    value: { ...text.body1Strong, color: colors.textPrimary, flexShrink: 1, textAlign: 'right' },
    row: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingVertical: 14 },
    icon: {
      alignItems: 'center',
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 20,
      borderWidth: 1,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    strong: { ...text.body1Strong, color: colors.textPrimary },
    caption: { ...text.caption, color: colors.textSecondary },
    bottom: { gap: 4, marginTop: 8 },
    withdraw: { color: colors.textSecondary, textDecorationLine: 'underline' },
    error: { ...text.body2, color: colors.danger },
    pressed: { opacity: 0.75 },
  } as const;
}
