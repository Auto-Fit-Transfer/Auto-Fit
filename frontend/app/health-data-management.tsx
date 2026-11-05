import { rememberUploadedFile } from '@/src/features/health-data/healthUploadSession';
import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CaretDownIcon from '@/assets/icons/ui/caret-down.svg';
import CheckIcon from '@/assets/icons/ui/check.svg';
import FileIcon from '@/assets/icons/ui/file-text.svg';
import InfoIcon from '@/assets/icons/ui/info.svg';
import LockIcon from '@/assets/icons/ui/lock.svg';
import {
  getAllHealthDocuments,
  getHealthDocumentErrorMessage,
  uploadHealthDocument,
  type HealthDocumentListItem,
} from '@/src/api/healthDocuments';
import { Text } from '@/src/components/common';
import { ScreenHeader } from '@/src/components/common/ScreenHeader';
import { HealthDataUploadBottomSheet } from '@/src/components/health-data/HealthDataUploadBottomSheet';
import type { SelectedHealthFile } from '@/src/features/health-data/useHealthFilePicker';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

type DocumentFilter = 'all' | HealthDocumentListItem['document_type'];

function uploadedLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const thisYear = date.getFullYear() === new Date().getFullYear();
  return `${thisYear ? '' : `${date.getFullYear()}년 `}${date.getMonth() + 1}월 ${date.getDate()}일 올림`;
}

function uniqueDocuments(items: HealthDocumentListItem[]) {
  return Array.from(new Map(items.map((item) => [item.uploaded_file_id, item])).values());
}

export default function HealthDataManagementScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [documents, setDocuments] = useState<HealthDocumentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadSheetOpen, setIsUploadSheetOpen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<DocumentFilter>('all');
  const [newestFirst, setNewestFirst] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setDocuments(uniqueDocuments(await getAllHealthDocuments({ status: 'confirmed' })));
    } catch (error) {
      Alert.alert('건강 데이터를 불러오지 못했어요.', getHealthDocumentErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const handleUpload = useCallback(
    async (file: SelectedHealthFile) => {
      if (isUploading) return;
      setIsUploading(true);
      try {
        const response = await uploadHealthDocument(file);
        rememberUploadedFile(response.uploaded_file_id, file);
        setIsUploadSheetOpen(false);
        router.push({
          pathname: '/ocr-result',
          params: { source: 'healthDataManagement', uploads: response.uploaded_file_id },
        });
      } catch (error) {
        Alert.alert('건강 데이터 업로드에 실패했어요.', getHealthDocumentErrorMessage(error));
      } finally {
        setIsUploading(false);
      }
    },
    [isUploading, router],
  );

  const filteredDocuments = useMemo(() => {
    const matching = selectedFilter === 'all' ? documents : documents.filter((item) => item.document_type === selectedFilter);
    const direction = newestFirst ? -1 : 1;
    return [...matching].sort((first, second) => {
      const firstTime = new Date(first.uploaded_at).getTime();
      const secondTime = new Date(second.uploaded_at).getTime();
      if (Number.isNaN(firstTime) || Number.isNaN(secondTime)) return 0;
      return (firstTime - secondTime) * direction;
    });
  }, [documents, newestFirst, selectedFilter]);

  return (
    <View style={styles.root}>
      <ScreenHeader onBack={() => router.back()} title="건강 데이터 관리" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heading}>
          <Text style={styles.title}>올린 자료 <Text style={styles.count}>{documents.length}건</Text></Text>
          <Pressable accessibilityLabel={`정렬 바꾸기, 지금은 ${newestFirst ? '최신순' : '오래된순'}`} accessibilityRole="button" hitSlop={10} onPress={() => setNewestFirst((value) => !value)} style={styles.sort}>
            <Text style={styles.sortText}>{newestFirst ? '최신순' : '오래된순'}</Text>
            <CaretDownIcon color={colors.textPrimary} height={16} width={16} />
          </Pressable>
        </View>
        <View style={styles.filters}>
          {([
            ['all', '전체'],
            ['health_checkup', '건강검진'],
            ['body_composition', '체성분'],
          ] as const).map(([filter, label]) => {
            const selected = selectedFilter === filter;
            return (
              <Pressable accessibilityRole="button" accessibilityState={{ selected }} key={filter} onPress={() => setSelectedFilter(filter)} style={[styles.filter, selected && styles.filterSelected]}>
                <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        {filteredDocuments.length > 0 ? (
          <View style={styles.list}>
            {filteredDocuments.map((item, index) => (
              <View key={item.uploaded_file_id} style={[styles.row, index > 0 && styles.rowDivider]}>
                <View style={styles.rowIcon}><FileIcon color={colors.textPrimary} height={22} width={22} /></View>
                <View style={styles.rowCopy}>
                  <Text numberOfLines={1} style={styles.rowTitle}>{item.original_file_name || item.file_name}</Text>
                  <Text style={styles.rowDetail}>{item.document_type === 'body_composition' ? '체성분' : '건강검진'} · {uploadedLabel(item.uploaded_at)}</Text>
                  <View style={styles.badge}>
                    <CheckIcon color={colors.success} height={14} width={14} />
                    <Text style={styles.badgeText}>확인 완료</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : isLoading ? (
          <ActivityIndicator color={colors.primaryText} style={styles.loading} />
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{documents.length === 0 ? '아직 올린 자료가 없어요.' : '이 종류의 자료가 없어요.'}</Text>
          </View>
        )}
        <View style={styles.tip}>
          <InfoIcon color={colors.textPrimary} height={20} width={20} />
          <Text style={styles.tipText}>인바디는 한 달에 한 번이면 충분해요</Text>
        </View>
        <View style={styles.security}>
          <LockIcon color={colors.textSecondary} height={18} width={18} />
          <Text style={styles.securityText}>올린 자료는 암호화해서 보관해요.</Text>
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        <Pressable accessibilityRole="button" onPress={() => setIsUploadSheetOpen(true)} style={styles.uploadButton}>
          <Text style={styles.uploadText}>자료 올리기</Text>
        </Pressable>
      </View>
      <HealthDataUploadBottomSheet isBusy={isUploading} onClose={() => setIsUploadSheetOpen(false)} onSelectFile={handleUpload} visible={isUploadSheetOpen} />
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { backgroundColor: colors.background, flex: 1 },
    content: { gap: 12, paddingBottom: 16, paddingHorizontal: 20, paddingTop: 8 },
    heading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    title: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 18, lineHeight: 26 },
    count: { color: colors.textSecondary },
    sort: { alignItems: 'center', flexDirection: 'row', gap: 4 },
    sortText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
    filters: { flexDirection: 'row', gap: 8 },
    filter: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 999, borderWidth: 1, height: 40, justifyContent: 'center', paddingHorizontal: 16 },
    filterSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterText: { color: colors.textBody, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
    filterTextSelected: { color: '#FFFFFF' },
    list: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
    row: { alignItems: 'center', flexDirection: 'row', gap: 12, padding: 16 },
    rowDivider: { borderTopColor: colors.border, borderTopWidth: 1 },
    rowIcon: { alignItems: 'center', backgroundColor: colors.background, borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
    rowCopy: { alignItems: 'flex-start', flex: 1, gap: 2, minWidth: 0 },
    rowTitle: { alignSelf: 'stretch', color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 16, lineHeight: 24 },
    rowDetail: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
    badge: { alignItems: 'center', backgroundColor: colors.successLight, borderRadius: 999, flexDirection: 'row', gap: 4, height: 26, marginTop: 4, paddingHorizontal: 10 },
    badgeText: { color: colors.success, fontFamily: fontFamilies.pretendardMedium, fontSize: 12 },
    loading: { marginVertical: 32 },
    empty: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, justifyContent: 'center', minHeight: 72 },
    emptyText: { color: colors.textSecondary, fontSize: 14 },
    tip: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 8, minHeight: 50, paddingHorizontal: 16 },
    tipText: { color: colors.textPrimary, flex: 1, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
    security: { alignItems: 'center', flexDirection: 'row', gap: 6 },
    securityText: { color: colors.textSecondary, flex: 1, fontSize: 14, lineHeight: 21 },
    footer: { paddingHorizontal: 20, paddingTop: 8 },
    uploadButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 12, height: 56, justifyContent: 'center' },
    uploadText: { color: '#FFFFFF', fontFamily: fontFamilies.pretendardBold, fontSize: 16 },
  } as const;
}
