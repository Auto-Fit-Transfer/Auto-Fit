import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import GoogleIcon from '@/assets/icons/auth-redesign/google-logo.svg';
import KakaoIcon from '@/assets/icons/auth-redesign/kakao-symbol.svg';
import CaretLeftIcon from '@/assets/icons/ui/caret-left.svg';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import LockIcon from '@/assets/icons/ui/lock.svg';
import { getSupabaseClient } from '@/src/lib/supabase';
import { apiRequest, getApiErrorMessage } from '@/src/api/client';
import { FormField } from '@/src/components/main/FormControls';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text } from '@/src/components/common';

export default function Account() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('확인 중');
  const [provider, setProvider] = useState('');
  const [providerKey, setProviderKey] = useState('');
  const version = Constants.expoConfig?.version;
  const [confirm, setConfirm] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    void getSupabaseClient().auth.getUser()
      .then(({ data, error: authError }) => {
        if (!live) return;
        if (authError) {
          setError('로그인 정보를 확인하지 못했어요.');
          return;
        }
        setEmail(data.user?.email || '이메일 없음');
        const currentProvider = data.user?.app_metadata?.provider;
        setProviderKey(String(currentProvider ?? ''));
        setProvider(currentProvider === 'email' ? '이메일' : currentProvider === 'kakao' ? '카카오' : currentProvider === 'google' ? 'Google' : String(currentProvider ?? '연결된 계정'));
      })
      .catch(() => { if (live) setError('로그인 정보를 확인하지 못했어요.'); });
    return () => { live = false; };
  }, []);

  const signOut = async () => {
    setBusy(true);
    setError('');
    try {
      const { error: authError } = await getSupabaseClient().auth.signOut();
      if (authError) throw authError;
      router.replace('/login');
    } catch (cause) {
      setError(getApiErrorMessage(cause));
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
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 35 }]}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()} style={styles.back}><CaretLeftIcon color={colors.textPrimary} height={24} width={24} /></Pressable>
          <Text style={styles.title}>계정 설정</Text>
          <View style={styles.back} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>로그인 정보</Text>
          <View style={styles.card}>
            <View style={styles.row}><Text style={styles.label}>이메일</Text><Text selectable style={styles.value}>{email}</Text></View>
            <View style={styles.divider} />
            <View style={styles.row}><Text style={styles.label}>로그인 방식</Text><Text style={styles.value}>{provider || '확인 중'}</Text></View>
          </View>
          <Text style={styles.note}>이메일과 현재 로그인 방식은 여기서 변경할 수 없어요.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>간편 로그인 연결</Text>
          <View style={styles.card}>
            {([['kakao', '카카오', <View key="kakao" style={styles.kakaoMark}><KakaoIcon height={14} width={14} /></View>], ['google', 'Google', <GoogleIcon key="google" height={22} width={22} />]] as const).map(([key, label, icon], index) => (
              <View key={key}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <View style={styles.row}>
                  <View style={styles.rowStart}>{icon}<Text style={styles.label}>{label}</Text></View>
                  {providerKey === key ? <View style={styles.connectedPill}><Text style={styles.connected}>연결됨</Text></View> : <Text style={styles.soon}>준비 중</Text>}
                </View>
              </View>
            ))}
          </View>
        </View>

        {provider === '이메일' ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>보안</Text>
            <Pressable hitSlop={16} accessibilityRole="button" onPress={() => router.push('/password/forgot')} style={styles.action}>
              <View style={styles.rowStart}>
                <LockIcon color={colors.textPrimary} height={22} width={22} />
                <View style={styles.actionCopy}>
                  <Text style={styles.label}>비밀번호 바꾸기</Text>
                  <Text style={styles.note}>이메일로 재설정 링크를 받아요.</Text>
                </View>
              </View>
              <CaretRightIcon color={colors.textSecondary} height={18} width={18} />
            </Pressable>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>약관 · 정보</Text>
          <View style={styles.card}>
            <View style={styles.row}><Text style={styles.label}>서비스 이용약관</Text><Text style={styles.soon}>준비 중</Text></View>
            <View style={styles.divider} />
            <View style={styles.row}><Text style={styles.label}>개인정보 처리방침</Text><Text style={styles.soon}>준비 중</Text></View>
          </View>
        </View>

        <Pressable hitSlop={8} accessibilityRole="button" disabled={busy} onPress={() => void signOut()} style={styles.signOut}>
          <Text style={styles.signOutText}>로그아웃</Text>
        </Pressable>
        <Pressable hitSlop={8} accessibilityRole="button" onPress={() => { setConfirm(true); setConfirmation(''); setError(''); }} style={styles.withdrawButton}>
          <Text style={styles.withdraw}>회원 탈퇴</Text>
        </Pressable>
        {version ? <Text style={styles.version}>앱 버전 {version}</Text> : null}
        {error && !confirm ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <Modal visible={confirm} transparent animationType="fade" onRequestClose={() => { if (!busy) setConfirm(false); }}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>정말 탈퇴하시겠어요?</Text>
            <Text style={styles.dialogDescription}>건강 데이터, 식단·운동 기록과 계정이 영구 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</Text>
            <FormField label="확인하려면 ‘탈퇴’를 입력하세요" value={confirmation} onChangeText={setConfirmation} editable={!busy} />
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <Pressable accessibilityRole="button" disabled={confirmation !== '탈퇴' || busy} onPress={() => void remove()} style={[styles.deleteButton, (confirmation !== '탈퇴' || busy) && styles.disabled]}>
              <Text style={styles.deleteText}>{busy ? '처리 중…' : '영구 삭제하고 탈퇴'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => setConfirm(false)} style={styles.cancel}>
              <Text style={styles.cancelText}>취소</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    screen: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 22 },
    header: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
    back: { width: 32, minHeight: 32, justifyContent: 'center' },
    title: { fontFamily: fontFamilies.pretendardSemiBold, fontSize: 16, color: colors.textPrimary },
    section: { gap: 11, marginBottom: 28 },
    sectionTitle: { fontFamily: fontFamilies.pretendardSemiBold, fontSize: 16, color: colors.textPrimary },
    card: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, paddingHorizontal: 16 },
    row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    divider: { height: 1, backgroundColor: colors.border },
    label: { fontFamily: fontFamilies.pretendardMedium, fontSize: 14, color: colors.textPrimary },
    value: { fontSize: 14, color: colors.textPrimary, fontFamily: fontFamilies.pretendardSemiBold, flexShrink: 1, textAlign: 'right' },
    kakaoMark: { alignItems: 'center', backgroundColor: '#FEE500', borderRadius: 11, height: 22, justifyContent: 'center', width: 22 },
    rowStart: { alignItems: 'center', flexDirection: 'row', flex: 1, gap: 12 },
    actionCopy: { flex: 1, gap: 2 },
    soon: { fontSize: 12, color: colors.textSecondary },
    connectedPill: { backgroundColor: colors.successLight, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    signOut: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 12, height: 48, justifyContent: 'center' },
    signOutText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 14 },
    withdrawButton: { alignItems: 'center', marginTop: 18, paddingVertical: 6 },
    version: { color: colors.textSecondary, fontSize: 12, marginTop: 6, textAlign: 'center' },
    note: { fontSize: 12, lineHeight: 18, color: colors.textSecondary },
    connected: { fontSize: 12, color: colors.success, fontFamily: fontFamilies.pretendardSemiBold },
    action: { backgroundColor: colors.surface, gap: 12, minHeight: 64, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    withdraw: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14, textDecorationLine: 'underline' },
    error: { color: colors.danger, fontSize: 14 },
    overlay: { flex: 1, padding: 22, backgroundColor: colors.overlay, justifyContent: 'center' },
    dialog: { padding: 22, borderRadius: 16, backgroundColor: colors.surface, gap: 16 },
    dialogTitle: { fontSize: 18, color: colors.textPrimary, fontFamily: fontFamilies.pretendardSemiBold },
    dialogDescription: { fontSize: 14, lineHeight: 21, color: colors.textSecondary },
    deleteButton: { minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.danger },
    disabled: { opacity: 0.45 },
    deleteText: { fontSize: 16, color: colors.surface, fontFamily: fontFamilies.pretendardSemiBold },
    cancel: { alignItems: 'center', paddingVertical: 8 },
    cancelText: { fontSize: 14, color: colors.textSecondary },
  } as const;
}
