import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import CaretDownIcon from '@/assets/icons/ui/caret-down.svg';
import FileTextIcon from '@/assets/icons/ui/file-text.svg';
import LockIcon from '@/assets/icons/ui/lock.svg';
import type { HealthDocumentListItem } from '@/src/api/healthDocuments';
import { AppButton, Badge, Chip, Notice, Text } from '@/src/components/common';
import { SubScreen } from '@/src/components/navigation';
import type { SelectedHealthFile } from '@/src/features/health-data/useHealthFilePicker';
import { radius, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { HealthDataUploadBottomSheet } from './HealthDataUploadBottomSheet';

type DocumentFilter = 'all' | HealthDocumentListItem['document_type'];
type DocumentSortOrder = 'newest' | 'oldest';

const filters: { value: DocumentFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'health_checkup', label: '건강검진' },
  { value: 'body_composition', label: '체성분' },
];

// "건강검진 · 10월 26일 올림", with the year when it is not this year.
function documentSubtitle(item: HealthDocumentListItem) {
  const kind = item.document_type === 'body_composition' ? '체성분' : '건강검진';
  const date = new Date(item.uploaded_at);
  if (Number.isNaN(date.getTime())) return kind;
  const year = date.getFullYear() === new Date().getFullYear() ? '' : `${date.getFullYear()}년 `;
  return `${kind} · ${year}${date.getMonth() + 1}월 ${date.getDate()}일 올림`;
}

export interface HealthDataManagementViewProps {
  documents: HealthDocumentListItem[];
  isLoading: boolean;
  isUploading: boolean;
  onBack: () => void;
  // Resolves true when the file was sent, so the sheet can close.
  onUpload: (file: SelectedHealthFile) => Promise<boolean>;
}

// Figma B7. Only confirmed sheets are listed, so each one shows "확인 완료"; viewing and deleting
// from a "⋯" menu wait for the server to support them.
export function HealthDataManagementView({
  documents,
  isLoading,
  isUploading,
  onBack,
  onUpload,
}: HealthDataManagementViewProps) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [isUploadSheetOpen, setIsUploadSheetOpen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<DocumentFilter>('all');
  const [sortOrder, setSortOrder] = useState<DocumentSortOrder>('newest');

  const visibleDocuments = useMemo(() => {
    const matching =
      selectedFilter === 'all'
        ? documents
        : documents.filter((item) => item.document_type === selectedFilter);
    const direction = sortOrder === 'newest' ? -1 : 1;

    return [...matching].sort((first, second) => {
      const firstTime = new Date(first.uploaded_at).getTime();
      const secondTime = new Date(second.uploaded_at).getTime();
      if (Number.isNaN(firstTime) || Number.isNaN(secondTime)) return 0;
      return (firstTime - secondTime) * direction;
    });
  }, [documents, selectedFilter, sortOrder]);

  return (
    <>
      <SubScreen
        footer={<AppButton onPress={() => setIsUploadSheetOpen(true)} title="자료 올리기" />}
        gap={16}
        onBack={onBack}
        title="건강 데이터 관리"
      >
        <View style={styles.headingRow}>
          <Text style={styles.heading}>
            올린 자료 <Text style={styles.count}>{documents.length}건</Text>
          </Text>
          <Pressable
            accessibilityLabel={`정렬: ${sortOrder === 'newest' ? '최신순' : '오래된순'}`}
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => setSortOrder((order) => (order === 'newest' ? 'oldest' : 'newest'))}
            style={styles.sortButton}
          >
            <Text style={styles.sortText}>{sortOrder === 'newest' ? '최신순' : '오래된순'}</Text>
            <CaretDownIcon color={colors.textSecondary} height={16} width={16} />
          </Pressable>
        </View>
        <View style={styles.filters}>
          {filters.map((filter) => (
            <Chip
              key={filter.value}
              label={filter.label}
              onPress={() => setSelectedFilter(filter.value)}
              selected={selectedFilter === filter.value}
            />
          ))}
        </View>
        {isLoading && documents.length === 0 ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.textSecondary} />
          </View>
        ) : visibleDocuments.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {documents.length === 0 ? '아직 올린 자료가 없어요.' : '이 종류의 자료가 없어요.'}
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {visibleDocuments.map((item, index) => (
              <View key={item.uploaded_file_id} style={[styles.item, index > 0 && styles.divider]}>
                <View style={styles.fileIcon}>
                  <FileTextIcon color={colors.textPrimary} height={20} width={20} />
                </View>
                <View style={styles.itemCopy}>
                  <Text numberOfLines={1} style={styles.itemTitle}>
                    {item.original_file_name || item.file_name}
                  </Text>
                  <Text style={styles.caption}>{documentSubtitle(item)}</Text>
                  <Badge label="확인 완료" style={styles.badge} tone="good" />
                </View>
              </View>
            ))}
          </View>
        )}
        <Notice body="인바디는 한 달에 한 번이면 충분해요" />
        <View style={styles.lockRow}>
          <LockIcon color={colors.textSecondary} height={18} width={18} />
          <Text style={styles.caption}>올린 자료는 암호화해서 보관해요.</Text>
        </View>
      </SubScreen>
      <HealthDataUploadBottomSheet
        description="건강검진 결과지나 인바디 결과지를 올리면 수치를 읽어 드려요."
        isBusy={isUploading}
        onClose={() => setIsUploadSheetOpen(false)}
        onSelectFile={async (file) => {
          if (await onUpload(file)) setIsUploadSheetOpen(false);
        }}
        title="자료 올리기"
        visible={isUploadSheetOpen}
      />
    </>
  );
}

function createStyles({ colors, text }: AppTheme) {
  return {
    headingRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    heading: { ...text.title2, color: colors.textPrimary },
    count: { ...text.title2, color: colors.textSecondary },
    sortButton: { alignItems: 'center', flexDirection: 'row', gap: 4, minHeight: 44 },
    sortText: { ...text.body2, color: colors.textBody },
    filters: { flexDirection: 'row', gap: 8, marginTop: -4 },
    loading: { alignItems: 'center', paddingVertical: 40 },
    empty: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.card,
      borderWidth: 1,
      paddingVertical: 32,
    },
    emptyText: { ...text.body2, color: colors.textSecondary },
    list: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.card,
      borderWidth: 1,
      paddingHorizontal: 16,
    },
    item: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, paddingVertical: 16 },
    divider: { borderTopColor: colors.border, borderTopWidth: 1 },
    fileIcon: {
      alignItems: 'center',
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 20,
      borderWidth: 1,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    itemCopy: { flex: 1, gap: 2, minWidth: 0 },
    itemTitle: { ...text.body1Strong, color: colors.textPrimary },
    caption: { ...text.caption, color: colors.textSecondary },
    badge: { marginTop: 6 },
    lockRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  } as const;
}
