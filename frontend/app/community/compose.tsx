import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CloseIcon from '@/assets/icons/common/X.svg';
import ImageIcon from '@/assets/icons/deco/Image.svg';
import {
  COMMUNITY_MAX_IMAGES,
  COMMUNITY_MAX_POST_LENGTH,
  createCommunityClubPost,
  createCommunityPost,
  getCommunityErrorCode,
  getMyCommunityActivities,
  uploadCommunityPhoto,
  type CommunityActivity,
  type CommunityPostCategory,
  type CommunityPhoto,
} from '@/src/api/community';
import { AppDialog } from '@/src/components/common';
import { emitCommunityEvent } from '@/src/features/community/communityEvents';
import { useCommunityActions } from '@/src/features/community/useCommunityActions';
import { colors, fontFamilies, radius, spacing, typography } from '@/src/theme';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const CATEGORIES: { key: CommunityPostCategory; label: string }[] = [
  { key: 'workout', label: '운동 기록' }, { key: 'routine', label: '루틴 공유' },
  { key: 'diet', label: '식단' }, { key: 'question', label: '질문' },
  { key: 'review', label: '후기' },
];

export default function CommunityComposeScreen() {
  const router = useRouter();
  // Opened from a club: the post goes to that club only.
  const { clubId, clubName } = useLocalSearchParams<{ clubId?: string; clubName?: string }>();
  const insets = useSafeAreaInsets();
  const actions = useCommunityActions();
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<CommunityPostCategory>('workout');
  const [tagInput, setTagInput] = useState('');
  const [photos, setPhotos] = useState<CommunityPhoto[]>([]);
  const [activities, setActivities] = useState<CommunityActivity[] | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<CommunityActivity | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const submittingRef = useRef(false);
  // Uploaded photos can be reused when only the post step fails (e.g. nickname missing).
  const uploadedIds = useRef(new Map<string, string>());
  const canSubmit = content.trim().length > 0 || photos.length > 0;
  const hasDraft = canSubmit || tagInput.trim().length > 0 || selectedActivity !== null;
  const remaining = COMMUNITY_MAX_IMAGES - photos.length;
  const draftKey = `auto-fit.community.draft.${clubId ?? 'feed'}`;

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(draftKey).then((raw) => {
      if (!active || !raw) return;
      const draft = JSON.parse(raw) as { content?: string; category?: CommunityPostCategory; tagInput?: string };
      if (typeof draft.content === 'string') setContent((current) => current || draft.content || '');
      if (CATEGORIES.some((item) => item.key === draft.category)) setCategory(draft.category!);
      if (typeof draft.tagInput === 'string') setTagInput(draft.tagInput);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [draftKey]);

  const saveDraft = async () => {
    if (!content.trim()) { actions.notify('임시저장할 글 내용을 입력해 주세요.'); return; }
    try {
      await AsyncStorage.setItem(draftKey, JSON.stringify({ content, category, tagInput }));
      if (photos.length > 0 || selectedActivity) actions.notify('글은 저장했어요. 사진과 운동 기록은 다시 선택해야 해요.');
      router.back();
    } catch { actions.notify('임시저장에 실패했어요. 다시 시도해 주세요.'); }
  };

  const loadActivities = async () => {
    if (activities !== null) { setActivities(null); return; }
    setActivityLoading(true);
    try { setActivities((await getMyCommunityActivities()).items); }
    catch (error) { actions.handleError(error); }
    finally { setActivityLoading(false); }
  };

  const pickPhotos = async () => {
    if (remaining <= 0) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ['images'],
        orderedSelection: true,
        // iPhone photos are often HEIC; ask iOS for the most compatible copy (JPEG), because
        // the server accepts only JPEG, PNG and WebP.
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        quality: 0.7,
        selectionLimit: remaining,
      });
      if (result.canceled) return;
      // Android hands over the original file, which can still be HEIC; leave those out up front
      // instead of failing the whole post at upload time. Only the type counts: an iOS copy
      // converted to JPEG may keep its .HEIC file name.
      const supported = result.assets.filter((asset) => !/hei[cf]/i.test(asset.mimeType ?? ''));
      if (supported.length < result.assets.length) {
        actions.notify('HEIC 형식 사진은 올릴 수 없어서 빼고 담았어요. JPEG로 저장해 주세요.');
      }
      const fitting = supported.filter((asset) => (asset.fileSize ?? 0) <= MAX_PHOTO_BYTES);
      if (fitting.length < supported.length) actions.notify('5MB가 넘는 사진은 빼고 담았어요.');
      setPhotos((current) => {
        const seen = new Set(current.map((photo) => photo.uri));
        const added = fitting
          .filter((asset) => !seen.has(asset.uri))
          .map((asset, index) => ({
            mimeType: asset.mimeType ?? 'image/jpeg',
            name: asset.fileName ?? `community-${Date.now()}-${index}.jpg`,
            uri: asset.uri,
            webFile: asset.file ?? undefined,
          }));
        return [...current, ...added].slice(0, COMMUNITY_MAX_IMAGES);
      });
    } catch {
      actions.notify('사진을 불러오지 못했어요. 다시 시도해 주세요.');
    }
  };

  const submit = async () => {
    if (!canSubmit || submittingRef.current) return;
    const tags = tagInput.split(/[,\s]+/).map((tag) => tag.replace(/^#/, '').trim()).filter(Boolean);
    if (tags.length > 5 || tags.some((tag) => tag.length > 20) ||
        new Set(tags.map((tag) => tag.toLowerCase())).size !== tags.length) {
      actions.notify('태그는 중복 없이 최대 5개, 각 20자 이하로 입력해 주세요.');
      return;
    }
    submittingRef.current = true;
    try {
      const uploadIds: string[] = [];
      for (const [index, photo] of photos.entries()) {
        let uploadId = uploadedIds.current.get(photo.uri);
        if (!uploadId) {
          setProgress(`사진 올리는 중 ${index + 1}/${photos.length}`);
          uploadId = (await uploadCommunityPhoto(photo)).upload_id;
          uploadedIds.current.set(photo.uri, uploadId);
        }
        uploadIds.push(uploadId);
      }
      setProgress('게시하는 중');
      if (clubId) {
        const post = await createCommunityClubPost(clubId, content, uploadIds, { category, tags, exercise_session_id: selectedActivity?.session_id });
        emitCommunityEvent({ clubId, post, type: 'clubPostCreated' });
      } else {
        const post = await createCommunityPost(content, uploadIds, { category, tags, exercise_session_id: selectedActivity?.session_id });
        emitCommunityEvent({ post, type: 'created' });
      }
      void AsyncStorage.removeItem(draftKey).catch(() => undefined);
      router.back();
    } catch (error) {
      if (getCommunityErrorCode(error) === 'COMMUNITY_UPLOAD_INVALID') uploadedIds.current.clear();
      actions.handleError(error, undefined, () => void submit());
    } finally {
      submittingRef.current = false;
      setProgress(null);
    }
  };

  const close = () => (hasDraft ? setConfirmDiscard(true) : router.back());

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        <Pressable accessibilityLabel="글쓰기 닫기" accessibilityRole="button" hitSlop={8} onPress={close} style={styles.cancel}>
          <Text style={styles.cancelText}>×</Text>
        </Pressable>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
          {clubName ? `${clubName}에 글쓰기` : '새 글'}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => void saveDraft()} style={styles.draftButton}><Text style={styles.draftText}>임시저장</Text></Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.fieldLabel}>분류</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          {CATEGORIES.map((item) => <Pressable key={item.key} accessibilityRole="button" accessibilityState={{ selected: category === item.key }} onPress={() => setCategory(item.key)} style={[styles.categoryChip, category === item.key && styles.categorySelected]}><Text style={[styles.categoryText, category === item.key && styles.categoryTextSelected]}>{item.label}</Text></Pressable>)}
        </ScrollView>
        <Text style={styles.fieldLabel}>내용</Text>
        <View style={styles.inputWrap}>
          <TextInput
            accessibilityLabel="글 내용"
            maxLength={COMMUNITY_MAX_POST_LENGTH}
            multiline
            onChangeText={setContent}
            placeholder="오늘의 운동, 식단, 작은 변화를 나눠 보세요"
            placeholderTextColor={colors.textNavigator}
            style={styles.input}
            textAlignVertical="top"
            value={content}
          />
          <Text style={styles.counter}>{content.length}/{COMMUNITY_MAX_POST_LENGTH}</Text>
        </View>

        <View style={styles.photoHeading}>
          <Text style={styles.fieldLabel}>사진</Text>
          <Text style={styles.fieldHint}>{photos.length}/{COMMUNITY_MAX_IMAGES} · 한 장 5MB 이하(JPG·PNG·WebP)</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.photos}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {photos.map((photo, index) => (
            <View key={photo.uri} style={styles.thumbnail}>
              <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} />
              <Pressable
                accessibilityLabel={`사진 ${index + 1} 빼기`}
                accessibilityRole="button"
                disabled={progress !== null}
                hitSlop={6}
                onPress={() =>
                  setPhotos((current) => current.filter((item) => item.uri !== photo.uri))
                }
                style={styles.remove}
              >
                <CloseIcon color={colors.surface} height={14} width={14} />
              </Pressable>
            </View>
          ))}
          {remaining > 0 ? (
            <Pressable
              accessibilityLabel="사진 추가"
              accessibilityRole="button"
              disabled={progress !== null}
              onPress={() => void pickPhotos()}
              style={[styles.thumbnail, styles.addPhoto]}
            >
              <ImageIcon color={colors.primaryDark} height={26} width={26} />
              <Text style={styles.addPhotoText}>
                {photos.length}/{COMMUNITY_MAX_IMAGES}
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <Text style={styles.fieldLabel}>태그 · 최대 5개</Text>
        <TextInput accessibilityLabel="글 태그" value={tagInput} onChangeText={setTagInput} placeholder="#하체, #스쿼트" maxLength={130} style={styles.tagInput} />
        <Text style={styles.fieldHint}>쉼표나 띄어쓰기로 구분해 주세요.</Text>

        <View style={styles.activityHeading}>
          <Text style={styles.fieldLabel}>운동 기록 첨부 · 선택</Text>
          <Pressable accessibilityRole="button" onPress={() => void loadActivities()}><Text style={styles.activityLink}>{activities ? '접기' : '기록 불러오기'}</Text></Pressable>
        </View>
        {activityLoading ? <Text style={styles.fieldHint}>운동 기록을 불러오는 중…</Text> : null}
        {activities?.length === 0 ? <Text style={styles.fieldHint}>완료한 운동 기록이 없어요.</Text> : null}
        {activities?.map((activity) => <Pressable key={activity.session_id} accessibilityRole="button" accessibilityState={{ selected: selectedActivity?.session_id === activity.session_id }} onPress={() => setSelectedActivity((current) => current?.session_id === activity.session_id ? null : activity)} style={[styles.activityOption, selectedActivity?.session_id === activity.session_id && styles.activitySelected]}><Text style={styles.activityName}>{activity.snapshot.name}</Text><Text style={styles.fieldHint}>{new Date(activity.completed_at).toLocaleDateString('ko-KR')} · {activity.snapshot.duration_minutes}분 · 약 {activity.snapshot.calories}kcal</Text></Pressable>)}
        {selectedActivity ? <Text style={styles.activityDisclosure}>선택한 운동 시간·열량·운동명이 글과 함께 공개됩니다.</Text> : null}

        <View style={styles.unsupported}>
          <Text style={styles.unsupportedTitle}>추가 글 정보</Text>
          <Text style={styles.unsupportedText}>공개 범위 선택은 연결 중이에요. 글은 전체 공개됩니다.</Text>
        </View>

        <Text style={styles.notice}>
          사진의 촬영 위치 정보는 자동으로 지워져요. 검진 결과지처럼 이름이나 개인정보가 보이는
          사진은 올리지 않도록 주의해 주세요. 커뮤니티 글은 의학적 조언이 아니에요.
        </Text>
      </ScrollView>

      {progress ? (
        <View style={styles.progress}>
          <Text style={styles.progressText}>{progress}…</Text>
        </View>
      ) : null}

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit || progress !== null }}
          disabled={!canSubmit || progress !== null}
          onPress={() => void submit()}
          style={({ pressed }) => [styles.post, (!canSubmit || progress !== null) && styles.postDisabled, pressed && styles.postPressed]}
        >
          <Text style={styles.postText}>올리기</Text>
        </Pressable>
      </View>

      <AppDialog
        cancelText="계속 쓰기"
        confirmText="나가기"
        description="작성 중인 글과 사진은 저장되지 않아요."
        destructive
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          router.back();
        }}
        title="작성을 그만할까요?"
        visible={confirmDiscard}
      />
      {actions.elements}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.surface, flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: spacing.xl,
  },
  cancel: { minWidth: 44, paddingVertical: spacing.sm },
  cancelText: { color: colors.textBody, fontFamily: fontFamilies.pretendardRegular, fontSize: 28 },
  draftButton: { minWidth: 58, alignItems: 'flex-end', paddingVertical: spacing.sm },
  draftText: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 12 },
  title: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
    flexShrink: 1,
    marginHorizontal: spacing.sm,
  },
  post: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: spacing.lg,
  },
  postDisabled: { backgroundColor: colors.border },
  postPressed: { backgroundColor: colors.primaryDark },
  postText: { color: colors.surface, fontFamily: fontFamilies.pretendardBold, fontSize: 15 },
  body: { gap: spacing.md, padding: spacing.xl },
  categoryRow: { flexDirection: 'row', gap: 7 },
  categoryChip: { borderColor: colors.border, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: colors.surface },
  categorySelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  categoryText: { color: colors.textSecondary, fontSize: 12 },
  categoryTextSelected: { color: colors.surface, fontFamily: fontFamilies.pretendardSemiBold },
  activityHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  activityLink: { color: colors.primaryDark, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 12 },
  activityOption: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, gap: 5 },
  activitySelected: { borderColor: colors.primary, backgroundColor: colors.background },
  activityName: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 13 },
  activityDisclosure: { color: colors.textSecondary, fontSize: 11, lineHeight: 16 },
  tagInput: { borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 13, minHeight: 44, color: colors.textPrimary },
  fieldLabel: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 14 },
  fieldHint: { color: colors.textSecondary, fontFamily: fontFamilies.pretendardRegular, fontSize: 11 },
  inputWrap: { borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, padding: spacing.md },
  input: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 100,
  },
  counter: { ...typography.caption, alignSelf: 'flex-end', color: colors.textSecondary },
  photoHeading: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  photos: { gap: spacing.sm },
  thumbnail: {
    backgroundColor: colors.border,
    borderRadius: radius.md,
    height: 84,
    overflow: 'hidden',
    width: 84,
  },
  remove: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderRadius: radius.round,
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    right: 4,
    top: 4,
    width: 22,
  },
  addPhoto: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: 2,
    justifyContent: 'center',
  },
  addPhotoText: { ...typography.label, color: colors.primaryDark },
  notice: { ...typography.bodySmall, color: colors.textSecondary },
  unsupported: { backgroundColor: colors.background, borderRadius: radius.md, gap: spacing.xs, padding: spacing.md },
  unsupportedTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardSemiBold, fontSize: 13 },
  unsupportedText: { ...typography.bodySmall, color: colors.textSecondary },
  bottom: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  progress: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingVertical: spacing.sm,
  },
  progressText: { ...typography.bodyEmphasis, color: colors.primaryDark },
});
