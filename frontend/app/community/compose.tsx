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
  View,
} from 'react-native';

import { aForm } from '@/src/components/a/form';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { koreanDate } from '@/src/lib/koreanDate';
import CloseIcon from '@/assets/icons/ui/x.svg';
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
import { AppDialog, Text, TextInput } from '@/src/components/common';
import { emitCommunityEvent } from '@/src/features/community/communityEvents';
import { useCommunityActions } from '@/src/features/community/useCommunityActions';
import { fontFamilies, spacing, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const CATEGORIES: { key: CommunityPostCategory; label: string }[] = [
  { key: 'workout', label: '운동 기록' }, { key: 'routine', label: '루틴 공유' },
  { key: 'diet', label: '식단' }, { key: 'question', label: '질문' },
  { key: 'review', label: '후기' },
];

export default function CommunityComposeScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  // Opened from a club: the post goes to that club only.
  const { clubId, clubName, share } = useLocalSearchParams<{ clubId?: string; clubName?: string; share?: string }>();
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

  // Opened from a finished workout (share = its session): that record is already attached.
  useEffect(() => {
    if (!share) return undefined;
    let active = true;
    void getMyCommunityActivities()
      .then(({ items }) => {
        if (!active) return;
        const mine = items.find((item) => item.session_id === share);
        setActivities(items);
        if (mine) {
          setSelectedActivity(mine);
          setCategory('workout');
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [share]);

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
          <CloseIcon color={colors.textPrimary} height={22} width={22} />
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
        <View style={styles.inputWrap}>
          <TextInput
            accessibilityLabel="글 내용"
            maxLength={COMMUNITY_MAX_POST_LENGTH}
            lineBreakStrategyIOS="hangul-word"
            multiline
            onChangeText={setContent}
            placeholder="오늘의 운동, 식단, 작은 변화를 나눠 보세요"
            placeholderTextColor={colors.textSecondary}
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
                <CloseIcon color={colors.onPrimary} height={12} width={12} />
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
              <ImageIcon color={colors.textPrimary} height={24} width={24} />
              <Text style={styles.addPhotoText}>
                {photos.length}/{COMMUNITY_MAX_IMAGES}
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <View style={styles.activityHeading}>
          <Text style={styles.fieldLabel}>기록 붙이기 <Text style={styles.fieldHint}>선택</Text></Text>
          <Pressable accessibilityRole="button" onPress={() => void loadActivities()} style={styles.activityButton}><Text style={styles.activityLink}>{activities ? '접기' : '기록 불러오기'}</Text></Pressable>
        </View>
        {activityLoading ? <Text style={styles.fieldHint}>운동 기록을 불러오는 중…</Text> : null}
        {activities?.length === 0 ? <Text style={styles.fieldHint}>완료한 운동 기록이 없어요.</Text> : null}
        {activities?.map((activity) => <Pressable key={activity.session_id} accessibilityRole="button" accessibilityState={{ selected: selectedActivity?.session_id === activity.session_id }} onPress={() => setSelectedActivity((current) => current?.session_id === activity.session_id ? null : activity)} style={[styles.activityOption, selectedActivity?.session_id === activity.session_id && styles.activitySelected]}><Text style={styles.activityName}>{activity.snapshot.name}</Text><Text style={styles.fieldHint}>{[koreanDate(activity.completed_at), activity.snapshot.duration_minutes ? `${activity.snapshot.duration_minutes}분` : null, activity.snapshot.calories ? `약 ${activity.snapshot.calories}kcal` : null].filter(Boolean).join(' · ')}</Text></Pressable>)}
        {selectedActivity ? <Text style={styles.activityDisclosure}>선택한 운동 시간·열량·운동명이 글과 함께 공개됩니다.</Text> : null}

        <Text style={styles.fieldLabel}>태그 · 최대 5개</Text>
        <TextInput accessibilityLabel="글 태그" value={tagInput} onChangeText={setTagInput} placeholder="#하체, #스쿼트" placeholderTextColor={colors.textSecondary} maxLength={130} style={styles.tagInput} />
        <Text style={styles.fieldHint}>쉼표나 띄어쓰기로 구분해 주세요.</Text>

        <View style={styles.visibilityRow}>
          <Text style={styles.fieldLabel}>공개 범위</Text>
          <Text style={styles.visibilityValue}>전체 공개</Text>
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
          <Text style={[styles.postText, (!canSubmit || progress !== null) && styles.disabledText]}>올리기</Text>
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

function createStyles({ colors }: AppTheme) {
  // Renewal B (b-community.html #vWrite): a round way out, the title bold in the middle, 임시저장 at the
  // right; the kinds as chips, one roomy white box to write in, and the black pill that posts at the foot.
  const a = aForm(colors);
  return {
    root: { alignSelf: 'center', backgroundColor: colors.background, flex: 1, maxWidth: 480, width: '100%' },
    header: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 56, paddingHorizontal: 20 },
    cancel: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
    draftButton: { ...a.mini, backgroundColor: colors.surface },
    draftText: a.miniText,
    title: { color: colors.textPrimary, flex: 1, fontFamily: fontFamilies.pretendardBold, fontSize: 16, lineHeight: 22, textAlign: 'center' },
    post: a.go,
    postDisabled: a.goOff,
    disabledText: { color: colors.textDisabled },
    postPressed: a.goPressed,
    postText: a.goText,
    body: { gap: 10, paddingHorizontal: 20, paddingVertical: 16 },
    categoryRow: { flexDirection: 'row', gap: 6, paddingBottom: 3 },
    categoryChip: { ...a.chip, backgroundColor: colors.surface, height: 38, paddingHorizontal: 14 },
    categorySelected: a.on,
    categoryText: a.chipText,
    categoryTextSelected: a.onText,
    activityHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    activityButton: { ...a.mini, backgroundColor: colors.surface },
    activityLink: a.miniText,
    visibilityRow: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 18, flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, minHeight: 52, paddingHorizontal: 16 },
    visibilityValue: a.note,
    activityOption: { backgroundColor: colors.surface, borderRadius: 18, gap: 4, paddingHorizontal: 16, paddingVertical: 14 },
    activitySelected: { backgroundColor: colors.surfaceMuted },
    activityName: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 14.5, lineHeight: 20 },
    activityDisclosure: a.note,
    tagInput: { ...a.field, ...a.input },
    fieldLabel: { ...a.note, fontFamily: fontFamilies.pretendardBold, marginTop: 10 },
    fieldHint: { ...a.note, fontFamily: fontFamilies.pretendardRegular },
    inputWrap: { backgroundColor: colors.surface, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14 },
    input: { ...a.input, lineHeight: 24, minHeight: 150 },
    counter: { ...a.note, alignSelf: 'flex-end' },
    photoHeading: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    photos: { gap: 8 },
    thumbnail: { backgroundColor: colors.surfaceMuted, borderRadius: 16, height: 72, overflow: 'hidden', width: 72 },
    remove: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: 12,
      height: 24,
      justifyContent: 'center',
      position: 'absolute',
      right: 4,
      top: 4,
      width: 24,
    },
    addPhoto: { alignItems: 'center', backgroundColor: colors.surface, gap: 2, justifyContent: 'center' },
    addPhotoText: a.note,
    notice: a.note,
    bottom: { paddingHorizontal: 20, paddingTop: 10 },
    progress: { alignItems: 'center', backgroundColor: colors.surfaceMuted, paddingVertical: 8 },
    progressText: { ...a.p15, color: colors.textPrimary },
  } as const;
}
