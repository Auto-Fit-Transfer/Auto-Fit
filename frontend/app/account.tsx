import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Back from '@/assets/figma/main/a08ac.svg';
import Lock from '@/assets/figma/main/1d22c.svg';
import User from '@/assets/figma/main/1e751.svg';
import Shield from '@/assets/figma/main/73089.svg';
import Arrow from '@/assets/figma/main/a9821.svg';
import { getSupabaseClient } from '@/src/lib/supabase';
import { apiRequest, getApiErrorMessage } from '@/src/api/client';
import { mainStyles } from '@/src/components/main/MainSurface';
import { FormField, form } from '@/src/components/main/FormControls';
import { colors, fontFamilies } from '@/src/theme';
export default function Account() {
  const router = useRouter(),
    insets = useSafeAreaInsets();
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
        setProvider(
          data.user?.app_metadata?.provider === 'email'
            ? '이메일'
            : String(data.user?.app_metadata?.provider ?? '연결된 계정'),
        );
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
    <View style={{ flex: 1, backgroundColor: '#FCFFFF' }}>
      <StatusBar style="dark" />
      <Image
        source={require('@/assets/figma/main/72632.png')}
        style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]}
        resizeMode="stretch"
      />
      <ScrollView
        contentContainerStyle={{
          paddingTop: Math.max(insets.top, 30),
          paddingBottom: insets.bottom + 30,
        }}
      >
        <View style={s.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="뒤로"
            onPress={() => router.back()}
          >
            <Back />
          </Pressable>
          <Text style={s.title}>계정 관리</Text>
          <View style={{ width: 25 }} />
        </View>
        <View style={[mainStyles.content, { marginTop: 140, gap: 40 }]}>
          <View style={{ gap: 12 }}>
            <Text style={mainStyles.sectionTitle}>로그인 정보</Text>
            <View style={[mainStyles.card, { gap: 20, padding: 20 }]}>
              <View style={s.line}>
                <Text style={s.label}>이메일</Text>
                <Text selectable style={s.value}>
                  {email}
                </Text>
              </View>
              <View style={s.divider} />
              <View style={s.line}>
                <Text style={s.label}>로그인 방식</Text>
                <Text style={s.value}>{provider}</Text>
              </View>
            </View>
            <Text style={mainStyles.text}>이메일과 로그인 방식은 변경할 수 없습니다.</Text>
          </View>
          <View style={{ gap: 12 }}>
            <Text style={mainStyles.sectionTitle}>보안</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/password/forgot')}
              style={[mainStyles.card, s.row]}
            >
              <View style={[s.icon, { backgroundColor: '#E8F8F4' }]}>
                <Lock />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>비밀번호 변경</Text>
                <Text style={mainStyles.text}>이메일로 비밀번호 재설정 링크를 받아요.</Text>
              </View>
              <Arrow />
            </Pressable>
          </View>
          <View style={{ gap: 12 }}>
            <Text style={mainStyles.sectionTitle}>계정 관리</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setConfirm(true);
                setConfirmation('');
                setError('');
              }}
              style={[mainStyles.card, s.row]}
            >
              <View style={[s.icon, { backgroundColor: '#FFEEEE' }]}>
                <User />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>회원 탈퇴</Text>
                <Text style={mainStyles.text}>계정을 탈퇴하고 모든 데이터를 삭제합니다.</Text>
              </View>
              <Arrow />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void signOut()}
              style={mainStyles.card}
            >
              <Text style={s.label}>로그아웃</Text>
            </Pressable>
          </View>
          <View style={[mainStyles.card, s.row, { backgroundColor: '#E8F8F4' }]}>
            <Shield />
            <Text style={[mainStyles.text, { flex: 1 }]}>
              안전한 계정 사용을 위해{`\n`}비밀번호를 주기적으로 변경하고 타인과 계정을 공유하지
              마세요.
            </Text>
          </View>
          {error && !confirm ? <Text style={form.error}>{error}</Text> : null}
        </View>
      </ScrollView>
      <Modal
        visible={confirm}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!busy) setConfirm(false);
        }}
      >
        <View style={s.overlay}>
          <View style={[mainStyles.card, { gap: 18 }]}>
            <Text style={mainStyles.sectionTitle}>정말 탈퇴하시겠어요?</Text>
            <Text style={mainStyles.text}>
              건강 데이터, 식단·운동 기록과 계정이 영구 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
            </Text>
            <FormField
              label="확인하려면 ‘탈퇴’를 입력하세요"
              value={confirmation}
              onChangeText={setConfirmation}
              editable={!busy}
            />
            {error ? <Text style={form.error}>{error}</Text> : null}
            <Pressable
              accessibilityRole="button"
              disabled={confirmation !== '탈퇴' || busy}
              onPress={() => void remove()}
              style={[
                mainStyles.button,
                {
                  backgroundColor: colors.danger,
                  opacity: confirmation === '탈퇴' && !busy ? 1 : 0.4,
                },
              ]}
            >
              <Text style={mainStyles.buttonText}>{busy ? '처리 중…' : '영구 삭제하고 탈퇴'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => setConfirm(false)}>
              <Text style={[mainStyles.text, { textAlign: 'center' }]}>취소</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
const s = StyleSheet.create({
  header: {
    paddingHorizontal: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 15, fontFamily: fontFamilies.pretendardBold, color: colors.textBody },
  line: { flexDirection: 'row', gap: 15, justifyContent: 'space-between' },
  label: { fontSize: 18, fontFamily: fontFamilies.pretendardSemiBold, color: colors.textBody },
  value: { fontSize: 15, color: colors.textSecondary, flexShrink: 1, textAlign: 'right' },
  divider: { height: 1, backgroundColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  overlay: { flex: 1, padding: 25, backgroundColor: colors.overlay, justifyContent: 'center' },
});
