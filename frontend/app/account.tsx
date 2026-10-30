import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Back from '@/assets/figma/main/a08ac.svg';
import { getSupabaseClient } from '@/src/lib/supabase';
import { apiRequest, getApiErrorMessage } from '@/src/api/client';
import { FormField } from '@/src/components/main/FormControls';
import { colors, fontFamilies } from '@/src/theme';

export default function Account() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('확인 중');
  const [provider, setProvider] = useState('');
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
        setEmail(data.user?.email ?? '이메일 없음');
        const currentProvider = data.user?.app_metadata?.provider;
        setProvider(currentProvider === 'email' ? '이메일' : String(currentProvider ?? '연결된 계정'));
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
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 35 }]}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()} style={styles.back}><Back /></Pressable>
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
          <Text style={styles.sectionTitle}>연결된 로그인</Text>
          <View style={styles.card}>
            <View style={styles.row}><Text style={styles.label}>{provider || '연결된 계정'}</Text><Text style={styles.connected}>사용 중</Text></View>
          </View>
          <Text style={styles.note}>다른 로그인 수단 연결은 준비 중이에요.</Text>
        </View>

        {provider === '이메일' ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>보안</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push('/password/forgot')} style={styles.action}>
              <Text style={styles.label}>비밀번호 변경</Text><Text style={styles.chevron}>›</Text>
            </Pressable>
            <Text style={styles.note}>이메일로 비밀번호 재설정 링크를 받아요.</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>계정 관리</Text>
          <View style={styles.card}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void signOut()} style={styles.actionInner}>
              <Text style={styles.label}>로그아웃</Text><Text style={styles.chevron}>›</Text>
            </Pressable>
            <View style={styles.divider} />
            <Pressable accessibilityRole="button" onPress={() => { setConfirm(true); setConfirmation(''); setError(''); }} style={styles.actionInner}>
              <Text style={styles.withdraw}>회원 탈퇴</Text><Text style={styles.chevron}>›</Text>
            </Pressable>
          </View>
          <Text style={styles.note}>탈퇴하면 계정과 건강·운동 기록이 영구 삭제돼요.</Text>
        </View>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 22 },
  header: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  back: { width: 32, minHeight: 32, justifyContent: 'center' },
  title: { fontFamily: fontFamilies.pretendardSemiBold, fontSize: 17, color: colors.textPrimary },
  section: { gap: 11, marginBottom: 28 },
  sectionTitle: { fontFamily: fontFamilies.pretendardSemiBold, fontSize: 16, color: colors.textPrimary },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, paddingHorizontal: 16 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  divider: { height: 1, backgroundColor: colors.border },
  label: { fontFamily: fontFamilies.pretendardMedium, fontSize: 14, color: colors.textPrimary },
  value: { fontSize: 14, color: colors.textSecondary, flexShrink: 1, textAlign: 'right' },
  note: { fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  connected: { fontSize: 12, color: colors.success, fontFamily: fontFamilies.pretendardSemiBold },
  action: { minHeight: 56, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actionInner: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chevron: { fontSize: 22, color: colors.textSecondary },
  withdraw: { color: colors.danger, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
  error: { color: colors.danger, fontSize: 13 },
  overlay: { flex: 1, padding: 22, backgroundColor: colors.overlay, justifyContent: 'center' },
  dialog: { padding: 22, borderRadius: 14, backgroundColor: colors.surface, gap: 16 },
  dialogTitle: { fontSize: 18, color: colors.textPrimary, fontFamily: fontFamilies.pretendardSemiBold },
  dialogDescription: { fontSize: 14, lineHeight: 21, color: colors.textSecondary },
  deleteButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.danger },
  disabled: { opacity: 0.45 },
  deleteText: { fontSize: 15, color: colors.surface, fontFamily: fontFamilies.pretendardSemiBold },
  cancel: { alignItems: 'center', paddingVertical: 8 },
  cancelText: { fontSize: 14, color: colors.textSecondary },
});
