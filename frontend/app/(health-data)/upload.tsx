import { useState, type ComponentType } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, View } from 'react-native';
import type { SvgProps } from 'react-native-svg';

import HeartbeatIcon from '@/assets/icons/ui/heartbeat.svg';
import LockIcon from '@/assets/icons/ui/lock.svg';
import ScalesIcon from '@/assets/icons/ui/scales.svg';
import { getHealthDocumentErrorMessage, uploadHealthDocument } from '@/src/api/healthDocuments';
import { AppButton, Text } from '@/src/components/common';
import { HealthUploadOptions } from '@/src/components/health-data/HealthUploadOptions';
import { SubScreen } from '@/src/components/navigation';
import { toUploadRouteItem } from '@/src/features/health-data/healthUpload';
import type { SelectedHealthFile } from '@/src/features/health-data/useHealthFilePicker';
import { radius, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

// What the reader picks up from each kind of sheet, shown as small tags (Figma B1).
const documentKinds = [
  {
    title: '건강검진 결과표',
    caption: '국가건강검진 · 병원 검진 결과지',
    Icon: HeartbeatIcon,
    tags: ['키', '몸무게', '혈압', '공복혈당', '콜레스테롤', '간 수치'],
  },
  {
    title: '인바디 결과지',
    caption: '헬스장 · 보건소 체성분 측정지',
    Icon: ScalesIcon,
    tags: ['체중', '골격근량', '체지방률', 'BMI', '기초대사량'],
  },
] as const;

// Figma B1: choose a photo or a file; the sheet is sent at once and read on the next screen.
export default function HealthDataUploadScreen() {
  const router = useRouter();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [isUploading, setIsUploading] = useState(false);

  const goHome = () => router.replace('/home');

  const upload = async (file: SelectedHealthFile) => {
    setIsUploading(true);
    try {
      const response = await uploadHealthDocument(file);
      router.push({
        pathname: '/ocr-result',
        params: {
          source,
          uploads: JSON.stringify([toUploadRouteItem(file, response.uploaded_file_id)]),
        },
      });
    } catch (error) {
      console.error('Health document upload failed:', error);
      Alert.alert('건강 데이터를 올리지 못했어요', getHealthDocumentErrorMessage(error));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <SubScreen
      footer={
        <>
          <Text style={styles.laterHint}>지금 안 올려도 괜찮아요.</Text>
          <AppButton
            disabled={isUploading}
            onPress={goHome}
            title="나중에 하기"
            variant="secondary"
          />
        </>
      }
      gap={28}
      onBack={() => (router.canGoBack() ? router.back() : goHome())}
    >
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>
          건강검진 결과나{'\n'}인바디 결과지가 있나요?
        </Text>
        <Text style={styles.description}>
          올려 주시면 수치를 읽어서 운동 · 식단 추천을 내 몸에 맞춰 바꿔 드려요.
        </Text>
      </View>
      <HealthUploadOptions busy={isUploading} onSelectFile={upload} />
      <View style={styles.reads}>
        <Text style={styles.sectionTitle}>이런 자료를 읽어요</Text>
        <View style={styles.readsCard}>
          {documentKinds.map((kind, index) => (
            <View key={kind.title} style={[styles.kind, index > 0 && styles.kindDivider]}>
              <DocumentKindIcon Icon={kind.Icon} />
              <View style={styles.kindCopy}>
                <Text style={styles.kindTitle}>{kind.title}</Text>
                <Text style={styles.caption}>{kind.caption}</Text>
                <View style={styles.tags}>
                  {kind.tags.map((tag) => (
                    <View key={tag} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          ))}
        </View>
        <View style={styles.lockRow}>
          <LockIcon color={colors.textSecondary} height={18} width={18} />
          <Text style={styles.lockText}>
            올린 자료는 암호화해서 보관하고, 동의 없이 밖으로 공유하지 않아요.
          </Text>
        </View>
      </View>
    </SubScreen>
  );
}

function DocumentKindIcon({ Icon }: { Icon: ComponentType<SvgProps> }) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.kindIcon}>
      <Icon color={colors.textPrimary} height={18} width={18} />
    </View>
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    heading: { gap: 8, paddingTop: 8 },
    title: { ...text.title1, color: colors.textPrimary },
    description: { ...text.body1, color: colors.textSecondary },
    reads: { gap: 12 },
    sectionTitle: { ...text.body2Strong, color: colors.textPrimary },
    readsCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.card,
      borderWidth: 1,
      paddingHorizontal: 16,
    },
    kind: { flexDirection: 'row', gap: 12, paddingVertical: 16 },
    kindDivider: { borderTopColor: colors.border, borderTopWidth: 1 },
    kindIcon: {
      alignItems: 'center',
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 18,
      borderWidth: 1,
      height: 36,
      justifyContent: 'center',
      width: 36,
    },
    kindCopy: { flex: 1, gap: 2 },
    kindTitle: { ...text.body2Strong, color: colors.textPrimary },
    caption: { ...text.caption, color: colors.textSecondary },
    tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    tag: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 6,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    tagText: { ...text.caption, color: colors.textBody },
    lockRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8, marginTop: 4 },
    lockText: { ...text.caption, color: colors.textSecondary, flex: 1 },
    laterHint: { ...text.body2, color: colors.textSecondary, textAlign: 'center' },
  } as const;
}
