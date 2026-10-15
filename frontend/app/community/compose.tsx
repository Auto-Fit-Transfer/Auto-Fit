import { useRef, useState } from 'react';
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
  uploadCommunityPhoto,
  type CommunityPhoto,
} from '@/src/api/community';
import { AppDialog } from '@/src/components/common';
import { emitCommunityEvent } from '@/src/features/community/communityEvents';
import { useCommunityActions } from '@/src/features/community/useCommunityActions';
import { colors, fontFamilies, radius, spacing, typography } from '@/src/theme';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export default function CommunityComposeScreen() {
  const router = useRouter();
  // Opened from a club: the post goes to that club only.
  const { clubId, clubName } = useLocalSearchParams<{ clubId?: string; clubName?: string }>();
  const insets = useSafeAreaInsets();
  const actions = useCommunityActions();
  const [content, setContent] = useState('');
  const [photos, setPhotos] = useState<CommunityPhoto[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const submittingRef = useRef(false);
  // Uploaded photos can be reused when only the post step fails (e.g. nickname missing).
  const uploadedIds = useRef(new Map<string, string>());
  const hasDraft = content.trim().length > 0 || photos.length > 0;
  const remaining = COMMUNITY_MAX_IMAGES - photos.length;

  const pickPhotos = async () => {
    if (remaining <= 0) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ['images'],
        orderedSelection: true,
        quality: 0.7,
        selectionLimit: remaining,
      });
      if (result.canceled) return;
      const fitting = result.assets.filter((asset) => (asset.fileSize ?? 0) <= MAX_PHOTO_BYTES);
      if (fitting.length < result.assets.length) actions.notify('5MB가 넘는 사진은 빼고 담았어요.');
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
    if (!hasDraft || submittingRef.current) return;
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
        const post = await createCommunityClubPost(clubId, content, uploadIds);
        emitCommunityEvent({ clubId, post, type: 'clubPostCreated' });
      } else {
        const post = await createCommunityPost(content, uploadIds);
        emitCommunityEvent({ post, type: 'created' });
      }
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
        <Pressable accessibilityRole="button" hitSlop={8} onPress={close} style={styles.cancel}>
          <Text style={styles.cancelText}>취소</Text>
        </Pressable>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
          {clubName ? `${clubName}에 글쓰기` : '새 글'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !hasDraft || progress !== null }}
          disabled={!hasDraft || progress !== null}
          onPress={() => void submit()}
          style={({ pressed }) => [
            styles.post,
            (!hasDraft || progress !== null) && styles.postDisabled,
            pressed && styles.postPressed,
          ]}
        >
          <Text style={styles.postText}>게시</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <TextInput
          accessibilityLabel="글 내용"
          autoFocus
          maxLength={COMMUNITY_MAX_POST_LENGTH}
          multiline
          onChangeText={setContent}
          placeholder="오늘의 운동, 식단, 작은 변화를 나눠 보세요"
          placeholderTextColor={colors.textNavigator}
          style={styles.input}
          textAlignVertical="top"
          value={content}
        />
        <Text style={styles.counter}>
          {content.length}/{COMMUNITY_MAX_POST_LENGTH}
        </Text>

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
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: spacing.lg,
  },
  cancel: { minWidth: 56, paddingVertical: spacing.sm },
  cancelText: { color: colors.textBody, fontFamily: fontFamilies.pretendardMedium, fontSize: 16 },
  title: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
    flexShrink: 1,
    marginHorizontal: spacing.sm,
  },
  post: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.round,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 64,
    paddingHorizontal: spacing.lg,
  },
  postDisabled: { backgroundColor: colors.border },
  postPressed: { backgroundColor: colors.primaryDark },
  postText: { color: colors.surface, fontFamily: fontFamilies.pretendardBold, fontSize: 15 },
  body: { gap: spacing.md, padding: spacing.lg },
  input: {
    color: colors.textPrimary,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 160,
  },
  counter: { ...typography.caption, alignSelf: 'flex-end', color: colors.textSecondary },
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
  progress: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingVertical: spacing.sm,
  },
  progressText: { ...typography.bodyEmphasis, color: colors.primaryDark },
});
