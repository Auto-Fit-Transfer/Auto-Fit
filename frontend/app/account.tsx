import { signOutOfApp } from '@/src/features/auth/accountSession';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import LockIcon from '@/assets/icons/ui/lock.svg';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { getSupabaseClient } from '@/src/lib/supabase';
import { apiRequest, getApiErrorMessage } from '@/src/api/client';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { aForm } from '@/src/components/a/form';
import { AppTextField, Text } from '@/src/components/common';

export default function Account() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('확인 중');
  const [provider, setProvider] = useState('');
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
        setProvider(currentProvider === 'email' ? '이메일' : currentProvider === 'kakao' ? '카카오' : currentProvider === 'google' ? 'Google' : String(currentProvider ?? '연결된 계정'));
      })
      .catch(() => { if (live) setError('로그인 정보를 확인하지 못했어요.'); });
    return () => { live = false; };
  }, []);

  const signOut = async () => {
    setBusy(true);
    setError('');
    try {
      await signOutOfApp();
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
      await signOutOfApp();
      router.replace('/login');
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader onBack={() => router.back()} title="계정" />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: 8, paddingBottom: insets.bottom + 35 }]}>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>로그인 정보</Text>
          <View style={styles.card}>
            <View style={styles.row}><Text style={styles.label}>이메일</Text><Text selectable style={styles.value}>{email}</Text></View>
            <View style={styles.divider} />
            <View style={styles.row}><Text style={styles.label}>로그인 방식</Text><Text style={styles.value}>{provider || '확인 중'}</Text></View>
          </View>
          <Text style={styles.note}>이메일과 현재 로그인 방식은 여기서 변경할 수 없어요.</Text>
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
            <AppTextField label="확인하려면 ‘탈퇴’를 입력하세요" value={confirmation} onChangeText={setConfirmation} editable={!busy} />
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
  // Renewal A: lines in outlined cards, signing out as a white button on its ledge. What cannot be undone
  // is the same button with its words in the warning colour.
  const a = aForm(colors);
  return {
    screen: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    content: { paddingHorizontal: 16 },
    section: { gap: 8, marginBottom: 22 },
    sectionTitle: { ...a.q, marginBottom: 0, paddingHorizontal: 2 },
    card: { ...a.card, paddingHorizontal: 14 },
    row: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', minHeight: 54 },
    divider: { backgroundColor: colors.track, height: 2 },
    label: { ...a.p15, color: colors.ink },
    value: { ...a.p12, color: colors.ink, flexShrink: 1, textAlign: 'right' },
    rowStart: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 12 },
    actionCopy: { flex: 1, gap: 2 },
    soon: a.note,
    signOut: { ...a.go, ...a.goGhost, height: 52 },
    signOutText: { ...a.goText, color: colors.ink },
    withdrawButton: { alignItems: 'center', marginTop: 18, paddingVertical: 6 },
    version: { ...a.note, marginTop: 6, textAlign: 'center' },
    note: a.note,
    action: { ...a.card, alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', minHeight: 64, paddingHorizontal: 14 },
    withdraw: a.link,
    error: { ...a.p12, color: colors.danger },
    overlay: { backgroundColor: 'rgba(22, 24, 46, 0.45)', flex: 1, justifyContent: 'center', padding: 20 },
    dialog: { ...a.card, borderRadius: 22, gap: 14, padding: 20 },
    dialogTitle: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, lineHeight: 28 },
    dialogDescription: { ...a.p15, color: colors.textBody },
    deleteButton: { ...a.go, ...a.goGhost, height: 52 },
    disabled: { opacity: 0.45 },
    deleteText: { ...a.goText, color: colors.danger },
    cancel: { alignItems: 'center', paddingVertical: 8 },
    cancelText: a.link,
  } as const;
}
