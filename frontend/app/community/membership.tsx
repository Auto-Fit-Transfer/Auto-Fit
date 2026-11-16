import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getCommunityErrorMessage,
  getCommunityMembership,
  startCommunityDemoMembership,
  type CommunityMembership,
} from '@/src/api/community';
import { AppButton, AppHeader, Text } from '@/src/components/common';
import { useCommunityActions } from '@/src/features/community/useCommunityActions';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';
import { aForm } from '@/src/components/a/form';

function formatDate(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

// Payments are not decided yet: this screen only offers the demo membership (no charge).
export default function CommunityMembershipScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const actions = useCommunityActions();
  const { notify } = actions;
  const [membership, setMembership] = useState<CommunityMembership | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setMembership(await getCommunityMembership());
      setErrorMessage(undefined);
    } catch (error) {
      setErrorMessage(getCommunityErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    // Same pattern as the home screen: start loading on the next frame.
    const frame = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(frame);
  }, [load]);

  const startDemo = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await startCommunityDemoMembership();
      setMembership(next);
      notify('시연용 유료 회원이 시작됐어요. 결제는 되지 않았어요.');
    } catch (error) {
      notify(getCommunityErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <AppHeader onBackPress={() => router.back()} title="유료 회원" />
      {errorMessage ? (
        <View style={styles.message}>
          <Text style={styles.messageText}>{errorMessage}</Text>
          <AppButton fullWidth={false} onPress={() => void load()} title="다시 시도" />
        </View>
      ) : membership === null ? (
        <ActivityIndicator color={colors.primary} style={styles.message} />
      ) : (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}>
          <View style={[styles.status, membership.active && styles.statusActive]}>
            <Text style={styles.statusTitle}>
              {membership.active ? '유료 회원 이용 중' : '아직 유료 회원이 아니에요'}
            </Text>
            {membership.active && membership.expires_at ? (
              <Text style={styles.statusText}>
                {formatDate(membership.expires_at)}까지
                {membership.source === 'demo' ? ' · 시연용(결제 없음)' : ''}
              </Text>
            ) : null}
          </View>

          <Text style={styles.sectionTitle}>유료 회원 혜택</Text>
          <Text style={styles.benefit}>· 마일리지를 쓰지 않고 클럽을 만들 수 있어요.</Text>

          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>시연용 안내</Text>
            <Text style={styles.noticeText}>
              결제 방식은 아직 정해지지 않았어요. 아래 버튼은 실제 결제 없이 유료 회원 기능을 체험해
              보는 시연용이에요. 기간과 혜택은 바뀔 수 있어요.
            </Text>
          </View>

          {membership.demo_available ? (
            <AppButton
              disabled={busy}
              onPress={() => void startDemo()}
              title={
                membership.active
                  ? `시연 기간 ${membership.demo_days ?? ''}일 더 늘리기`
                  : `시연용 유료 회원 시작 (${membership.demo_days ?? ''}일, 결제 없음)`
              }
            />
          ) : (
            <Text style={styles.off}>지금은 시연용 유료 회원을 시작할 수 없어요.</Text>
          )}
        </ScrollView>
      )}
      {actions.elements}
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  const a = aForm(colors);
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    message: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center', padding: 32 },
    messageText: { ...a.p15, color: colors.textBody, textAlign: 'center' },
    body: { gap: 12, paddingHorizontal: 16, paddingTop: 12 },
    status: { ...a.card, gap: 4, padding: 18 },
    statusActive: { backgroundColor: colors.primaryLight },
    statusTitle: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, lineHeight: 28 },
    statusText: { ...a.p15, color: colors.textBody },
    sectionTitle: { ...a.p15, color: colors.ink, marginTop: 8 },
    benefit: { ...a.p15, color: colors.textBody },
    notice: { backgroundColor: colors.surface, borderColor: colors.track, borderRadius: 12, borderWidth: 2, gap: 4, marginBottom: 8, padding: 14 },
    noticeTitle: { ...a.p12, color: colors.ink },
    noticeText: a.note,
    off: { ...a.p15, color: colors.textBody, textAlign: 'center' },
  } as const;
}
