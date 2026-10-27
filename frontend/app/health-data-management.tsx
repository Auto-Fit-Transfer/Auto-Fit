import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Animated,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import FileIcon from '@/assets/icons/deco/ClipboardText.svg';
import FatIcon from '@/assets/icons/data/Fat.svg';
import PlusIcon from '@/assets/icons/deco/Plus.svg';
import CaretDownIcon from '@/assets/icons/common/chevrons/Down.svg';
import CaretRightIcon from '@/assets/icons/common/chevrons/Right.svg';
import DotsThreeIcon from '@/assets/icons/system/DotsThreeVertical.svg';
import ShieldCheckIcon from '@/assets/icons/system/ShieldCheck.svg';
import TrashIcon from '@/assets/icons/common/Trash.svg';
import {
  getAllHealthDocuments,
  getHealthDocumentErrorMessage,
  uploadHealthDocument,
  type HealthDocumentListItem,
} from '@/src/api/healthDocuments';
import { Text } from '@/src/components/common';
import { HealthDataUploadBottomSheet } from '@/src/components/health-data/HealthDataUploadBottomSheet';
import { BackButton } from '@/src/components/common/BackButton';
import type { OCRUploadRouteItem } from '@/src/features/health-data/ocrResults';
import type { SelectedHealthFile } from '@/src/features/health-data/useHealthFilePicker';
import { colors, fontFamilies, radius } from '@/src/theme';

const dataIllustration = require('../assets/images/illustrations/data/Data.png');

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function documentFileName(item: HealthDocumentListItem) {
  return item.original_file_name || item.file_name;
}

function documentSubtitle(item: HealthDocumentListItem) {
  return `${formatDate(item.uploaded_at)} · ${item.document_type === 'body_composition' ? '체성분 분석' : '건강검진'}`;
}

function uniqueDocuments(items: HealthDocumentListItem[]) {
  return Array.from(new Map(items.map((item) => [item.uploaded_file_id, item])).values());
}

type DocumentFilter = 'all' | HealthDocumentListItem['document_type'];
type DocumentSortOrder = 'newest' | 'oldest';
type DeleteMenuPhase = 'closing' | 'idle' | 'opening' | 'open';

export default function HealthDataManagementScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [documents, setDocuments] = useState<HealthDocumentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadSheetOpen, setIsUploadSheetOpen] = useState(false);
  const [mountedMenuId, setMountedMenuId] = useState<string | null>(null);
  const [deleteMenuPhase, setDeleteMenuPhase] = useState<DeleteMenuPhase>('idle');
  const [selectedFilter, setSelectedFilter] = useState<DocumentFilter>('all');
  const [sortOrder, setSortOrder] = useState<DocumentSortOrder>('newest');
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [deleteMenuAnimation] = useState(() => new Animated.Value(0));
  const [listScrollY] = useState(() => new Animated.Value(0));
  const [listViewportHeight, setListViewportHeight] = useState(0);
  const [listContentHeight, setListContentHeight] = useState(0);
  const deleteMenuTransitionRef = useRef(0);
  const menuInteractionRef = useRef(false);

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
        const uploads: OCRUploadRouteItem[] = [
          {
            file: {
              height: file.height,
              mimeType: file.mimeType,
              name: file.name,
              size: file.size,
              source: file.source,
              uri: file.uri,
              width: file.width,
            },
            uploadedFileId: response.uploaded_file_id,
          },
        ];
        setIsUploadSheetOpen(false);
        router.push({
          pathname: '/ocr-result',
          params: { source: 'healthDataManagement', uploads: JSON.stringify(uploads) },
        });
      } catch (error) {
        Alert.alert('건강 데이터 업로드에 실패했어요.', getHealthDocumentErrorMessage(error));
      } finally {
        setIsUploading(false);
      }
    },
    [isUploading, router],
  );

  const bodyCompositionCount = documents.filter((item) => item.document_type === 'body_composition').length;
  const checkupCount = documents.length - bodyCompositionCount;
  const filteredDocuments = useMemo(() => {
    const documentsForFilter =
      selectedFilter === 'all'
        ? documents
        : documents.filter((item) => item.document_type === selectedFilter);
    const direction = sortOrder === 'newest' ? -1 : 1;

    return [...documentsForFilter].sort((first, second) => {
      const firstTime = new Date(first.uploaded_at).getTime();
      const secondTime = new Date(second.uploaded_at).getTime();
      if (Number.isNaN(firstTime) || Number.isNaN(secondTime)) return 0;
      return (firstTime - secondTime) * direction;
    });
  }, [documents, selectedFilter, sortOrder]);
  const hasScrollableDocuments = listContentHeight > listViewportHeight + 1;
  const scrollbarThumbHeight = hasScrollableDocuments
    ? Math.max(24, (listViewportHeight * listViewportHeight) / listContentHeight)
    : 0;
  const scrollbarTravel = Math.max(0, listViewportHeight - scrollbarThumbHeight);
  const maxListScroll = Math.max(1, listContentHeight - listViewportHeight);

  const handleDeleteUnavailable = useCallback(() => {
    ++deleteMenuTransitionRef.current;
    setMountedMenuId(null);
    setDeleteMenuPhase('idle');
    deleteMenuAnimation.setValue(0);
    Alert.alert('삭제 기능 준비 중', '현재 서버에서 건강 데이터 삭제 기능을 지원하지 않아요.');
  }, [deleteMenuAnimation]);

  const closeDeleteMenu = useCallback(() => {
    if (!mountedMenuId || deleteMenuPhase === 'closing') return;
    const transition = ++deleteMenuTransitionRef.current;
    setDeleteMenuPhase('closing');
    deleteMenuAnimation.stopAnimation();
    Animated.timing(deleteMenuAnimation, {
      duration: 120,
      toValue: 0,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && transition === deleteMenuTransitionRef.current) {
        setMountedMenuId(null);
        setDeleteMenuPhase('idle');
      }
    });
  }, [deleteMenuAnimation, deleteMenuPhase, mountedMenuId]);

  const toggleDeleteMenu = useCallback(
    (uploadedFileId: string) => {
      if (mountedMenuId === uploadedFileId) {
        closeDeleteMenu();
        return;
      }

      // Switching cards invalidates any pending exit callback and replaces the mounted menu.
      ++deleteMenuTransitionRef.current;
      deleteMenuAnimation.stopAnimation();
      deleteMenuAnimation.setValue(0);
      setMountedMenuId(uploadedFileId);
      setDeleteMenuPhase('opening');
    },
    [closeDeleteMenu, deleteMenuAnimation, mountedMenuId],
  );

  useEffect(() => {
    if (!mountedMenuId || deleteMenuPhase !== 'opening') return undefined;

    const transition = ++deleteMenuTransitionRef.current;
    deleteMenuAnimation.setValue(0);
    const frame = requestAnimationFrame(() => {
      Animated.timing(deleteMenuAnimation, {
        duration: 150,
        toValue: 1,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && transition === deleteMenuTransitionRef.current) {
          setDeleteMenuPhase('open');
        }
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [deleteMenuAnimation, deleteMenuPhase, mountedMenuId]);

  const markMenuInteraction = useCallback(() => {
    menuInteractionRef.current = true;
  }, []);

  const handleRootTouchStart = useCallback(() => {
    if (!mountedMenuId) return;
    requestAnimationFrame(() => {
      if (menuInteractionRef.current) {
        menuInteractionRef.current = false;
        return;
      }
      closeDeleteMenu();
    });
  }, [closeDeleteMenu, mountedMenuId]);

  return (
    <View onTouchStart={mountedMenuId ? handleRootTouchStart : undefined} style={styles.root}>
      <View style={[styles.header, { height: insets.top + 52, paddingTop: insets.top + 4 }]}>
        <View style={styles.headerRow}>
          <BackButton onPress={() => router.back()} size={44} style={styles.back} />
          <Text style={styles.headerTitle}>건강 데이터 관리</Text>
        </View>
      </View>
      <View style={styles.fixedContent}>
        <View style={styles.intro}>
          <View>
            <Text style={styles.introTitle}>내 건강 데이터를{`\n`}안전하게 관리하세요</Text>
            <Text style={styles.introDescription}>업로드한 검사 결과를 바탕으로{`\n`}더 정확한 건강 분석을 제공해요.</Text>
          </View>
          <Image resizeMode="contain" source={dataIllustration} style={styles.illustration} />
        </View>

        <View style={styles.summaryCard}>
          <SummaryItem count={documents.length} label="전체 데이터" sublabel="모든 데이터" Icon={FileIcon} />
          <View style={styles.summaryDivider} />
          <SummaryItem count={checkupCount} label="건강 검진" sublabel="건강검진 결과" Icon={FileIcon} />
          <View style={styles.summaryDivider} />
          <SummaryItem count={bodyCompositionCount} label="체성분 분석" sublabel="체성분 분석" Icon={FatIcon} />
        </View>

        <View style={styles.filters}>
          {([
            ['all', '전체'],
            ['health_checkup', '건강 검진'],
            ['body_composition', '체성분 분석'],
          ] as const).map(([filter, label]) => {
            const selected = selectedFilter === filter;
            return (
              <Pressable
                key={filter}
                onPress={() => setSelectedFilter(filter)}
                style={[styles.filter, selected && styles.filterSelected]}
              >
                <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.listHeading}>
          <Text style={styles.sectionTitle}>업로드한 데이터</Text>
          <View style={styles.sortControl}>
            <Pressable
              accessibilityLabel="정렬 선택"
              hitSlop={8}
              onPress={() => setIsSortMenuOpen((open) => !open)}
              style={styles.sortButton}
            >
              <Text style={styles.sortText}>{sortOrder === 'newest' ? '최신순' : '오래된순'}</Text>
              <CaretDownIcon height={10} width={10} />
            </Pressable>
            {isSortMenuOpen ? (
              <View style={styles.sortMenu}>
                {([
                  ['newest', '최신순'],
                  ['oldest', '오래된순'],
                ] as const).map(([order, label]) => (
                  <Pressable
                    key={order}
                    onPress={() => {
                      setSortOrder(order);
                      setIsSortMenuOpen(false);
                    }}
                    style={styles.sortMenuItem}
                  >
                    <Text style={[styles.sortMenuText, sortOrder === order && styles.sortMenuTextSelected]}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </View>
      <View
        onLayout={(event) => setListViewportHeight(event.nativeEvent.layout.height)}
        style={styles.listArea}
      >
        <FlatList
          contentContainerStyle={styles.documentListContent}
          data={filteredDocuments}
          ItemSeparatorComponent={() => <View style={styles.documentSeparator} />}
          keyExtractor={(item) => item.uploaded_file_id}
          ListEmptyComponent={
            isLoading ? (
              <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>
                  {documents.length === 0
                    ? '업로드한 건강 데이터가 없어요.'
                    : '선택한 유형의 건강 데이터가 없어요.'}
                </Text>
              </View>
            )
          }
          onContentSizeChange={(_, height) => setListContentHeight(height)}
          onScroll={(event) => listScrollY.setValue(event.nativeEvent.contentOffset.y)}
          removeClippedSubviews={false}
          renderItem={({ item }) => {
              const Icon = item.document_type === 'body_composition' ? FatIcon : FileIcon;
              const isMenuOpen = mountedMenuId === item.uploaded_file_id;
              return (
                <View
                  key={item.uploaded_file_id}
                  style={[styles.documentCard, isMenuOpen && styles.documentCardMenuOpen]}
                >
                  <View style={styles.documentIcon}><Icon color={colors.primary} height={22} width={22} /></View>
                  <View style={styles.documentText}>
                    <Text numberOfLines={1} style={styles.documentTitle}>{documentFileName(item)}</Text>
                    <Text style={styles.documentSubtitle}>{documentSubtitle(item)}</Text>
                  </View>
                  <View style={styles.documentActions}>
                    <CaretRightIcon height={17} width={17} />
                    <Pressable
                      accessibilityLabel={`${documentFileName(item)} 메뉴`}
                      hitSlop={8}
                      onPress={() => toggleDeleteMenu(item.uploaded_file_id)}
                      onPressIn={markMenuInteraction}
                      style={styles.menuButton}
                    >
                      <DotsThreeIcon color={colors.textNavigator} height={17} width={17} />
                    </Pressable>
                  </View>
                  {isMenuOpen ? (
                    <Animated.View
                      style={[
                        styles.deleteMenu,
                        {
                          opacity: deleteMenuAnimation,
                          transform: [
                            {
                              scale: deleteMenuAnimation.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0.96, 1],
                              }),
                            },
                            {
                              translateY: deleteMenuAnimation.interpolate({
                                inputRange: [0, 1],
                                outputRange: [-3, 0],
                              }),
                            },
                          ],
                        },
                      ]}
                    >
                      <Pressable
                        accessibilityLabel={`${documentFileName(item)} 삭제`}
                        onPress={handleDeleteUnavailable}
                        onPressIn={markMenuInteraction}
                        style={styles.deleteMenuButton}
                      >
                        <TrashIcon color={colors.danger} height={20} width={20} />
                        <Text style={styles.deleteMenuText}>삭제</Text>
                      </Pressable>
                    </Animated.View>
                  ) : null}
                </View>
              );
            }}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          style={styles.documentList}
        />
        {hasScrollableDocuments ? (
          <View pointerEvents="none" style={styles.scrollbarTrack}>
            <Animated.View
              style={[
                styles.scrollbarThumb,
                {
                  height: scrollbarThumbHeight,
                  transform: [
                    {
                      translateY: listScrollY.interpolate({
                        extrapolate: 'clamp',
                        inputRange: [0, maxListScroll],
                        outputRange: [0, scrollbarTravel],
                      }),
                    },
                  ],
                },
              ]}
            />
          </View>
        ) : null}
      </View>
      <View style={[styles.bottomArea, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
        <View style={styles.security}><ShieldCheckIcon color={colors.primary} height={17} width={17} /><Text style={styles.securityText}>업로드한 모든 데이터는 암호화되어 안전하게 관리됩니다.</Text></View>
        <Pressable onPress={() => setIsUploadSheetOpen(true)} style={styles.uploadButton}>
          <View style={styles.uploadIcon}><PlusIcon color={colors.surface} height={15} width={15} /></View><Text style={styles.uploadText}>데이터 업로드</Text>
        </Pressable>
      </View>
      <HealthDataUploadBottomSheet isBusy={isUploading} onClose={() => setIsUploadSheetOpen(false)} onSelectFile={handleUpload} visible={isUploadSheetOpen} />
    </View>
  );
}

function SummaryItem({ count, label, sublabel, Icon }: { count: number; label: string; sublabel: string; Icon: typeof FileIcon }) {
  return <View style={styles.summaryItem}><View style={styles.summaryIcon}><Icon color={colors.primary} height={22} width={22} /></View><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryCount}>{count}<Text style={styles.summaryUnit}>건</Text></Text><Text style={styles.summarySubLabel}>{sublabel}</Text></View>;
}

const styles = StyleSheet.create({
  back: { left: 10, position: 'absolute', top: 0 },
  bottomArea: { paddingHorizontal: 21, paddingTop: 12 },
  deleteMenu: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    elevation: 5,
    height: 30,
    position: 'absolute',
    right: 0,
    shadowColor: '#000',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    top: 50,
    width: 75,
    zIndex: 3,
  },
  deleteMenuButton: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 7 },
  deleteMenuText: { color: colors.textBody, fontFamily: fontFamilies.pretendardBold, fontSize: 14, includeFontPadding: false, lineHeight: 18 },
  documentActions: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', width: 50 },
  documentCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', height: 60, paddingHorizontal: 13, position: 'relative' },
  documentCardMenuOpen: { zIndex: 2 },
  documentIcon: { alignItems: 'center', backgroundColor: colors.primaryLight, borderRadius: radius.round, height: 30, justifyContent: 'center', width: 30 },
  documentSubtitle: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 13, includeFontPadding: false, lineHeight: 16 },
  documentText: { flex: 1, gap: 5, marginLeft: 9, minWidth: 0 },
  documentTitle: { color: colors.textBody, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 15, includeFontPadding: false, lineHeight: 18 },
  emptyCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, height: 60, justifyContent: 'center' },
  emptyText: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
  filter: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.textNavigator, borderRadius: radius.xl, borderWidth: 1, flex: 1, height: 32, justifyContent: 'center' },
  filterSelected: { borderColor: colors.primary },
  filterText: { color: colors.textNavigator, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 14, includeFontPadding: false, lineHeight: 18 },
  filterTextSelected: { color: colors.primary },
  filters: { flexDirection: 'row', gap: 5, marginTop: 12 },
  fixedContent: { paddingHorizontal: 21 },
  header: { backgroundColor: colors.background },
  headerRow: { alignItems: 'center', height: 44, justifyContent: 'center', position: 'relative' },
  headerTitle: { color: colors.textBody, fontFamily: fontFamilies.pretendardBold, fontSize: 15, letterSpacing: 1.5, lineHeight: 20 },
  illustration: { height: 120, position: 'absolute', right: 0, top: 10, width: 120, zIndex: 1 },
  intro: { height: 116, justifyContent: 'flex-start', paddingHorizontal: 2, paddingTop: 4, position: 'relative' },
  introDescription: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14, includeFontPadding: false, lineHeight: 20, marginTop: 11 },
  introTitle: { color: colors.textBody, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 20, lineHeight: 26 },
  documentList: { flex: 1 },
  documentListContent: { paddingBottom: 12, paddingHorizontal: 21 },
  documentSeparator: { height: 12 },
  listArea: { flex: 1, minHeight: 0, position: 'relative' },
  listHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 17, marginBottom: 7, zIndex: 3 },
  loading: { alignItems: 'center', height: 80, justifyContent: 'center' },
  root: { backgroundColor: colors.background, flex: 1 },
  scrollbarThumb: { backgroundColor: colors.primary, borderRadius: radius.round, width: 3 },
  scrollbarTrack: { bottom: 12, position: 'absolute', right: 13, top: 0, width: 3 },
  security: { alignItems: 'center', backgroundColor: colors.primaryLight, borderRadius: radius.sm, flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingVertical: 6 },
  securityText: { color: colors.textBody, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 13, includeFontPadding: false, lineHeight: 17 },
  sectionTitle: { color: colors.textBody, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 18, includeFontPadding: false, lineHeight: 22 },
  sortButton: { alignItems: 'center', flexDirection: 'row', gap: 3, paddingVertical: 4 },
  sortControl: { alignItems: 'flex-end', position: 'relative' },
  sortMenu: { backgroundColor: colors.surface, borderRadius: radius.sm, elevation: 5, position: 'absolute', right: 0, shadowColor: '#000', shadowOffset: { height: 0, width: 0 }, shadowOpacity: 0.15, shadowRadius: 4, top: 28, width: 82, zIndex: 4 },
  sortMenuItem: { alignItems: 'center', height: 30, justifyContent: 'center' },
  sortMenuText: { color: colors.textBody, fontFamily: fontFamilies.pretendardMedium, fontSize: 13, includeFontPadding: false, lineHeight: 17 },
  sortMenuTextSelected: { color: colors.primaryDark, fontFamily: fontFamilies.pretendardSemiBold },
  sortText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardRegular, fontSize: 14, includeFontPadding: false, lineHeight: 18 },
  summaryCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: 'row', height: 140, justifyContent: 'space-evenly', marginTop: 16, paddingHorizontal: 8 },
  summaryCount: { color: colors.textBody, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 20, includeFontPadding: false, lineHeight: 24 },
  summaryDivider: { backgroundColor: colors.border, height: 75, width: StyleSheet.hairlineWidth },
  summaryIcon: { alignItems: 'center', backgroundColor: colors.primaryLight, borderRadius: radius.round, height: 30, justifyContent: 'center', width: 30 },
  summaryItem: { alignItems: 'center', flex: 1, gap: 5 },
  summaryLabel: { color: colors.textBody, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 14, includeFontPadding: false, lineHeight: 18, textAlign: 'center' },
  summarySubLabel: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 11, includeFontPadding: false, lineHeight: 15, textAlign: 'center' },
  summaryUnit: { fontSize: 14 },
  menuButton: { alignItems: 'center', height: 28, justifyContent: 'center', width: 28 },
  uploadButton: { alignItems: 'center', alignSelf: 'flex-end', backgroundColor: colors.surface, borderRadius: radius.xl, elevation: 2, flexDirection: 'row', gap: 3, marginTop: 12, paddingHorizontal: 10, paddingVertical: 5, shadowColor: '#000', shadowOffset: { height: 1, width: 1 }, shadowOpacity: 0.1, shadowRadius: 2.5 },
  uploadIcon: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.round, height: 20, justifyContent: 'center', width: 20 },
  uploadText: { color: colors.primary, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 15, includeFontPadding: false, lineHeight: 20 },
});
