import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraView, useCameraPermissions, type RecordingProgress } from 'expo-camera';
import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RetryIcon from '@/assets/icons/system/ArrowsClockwise.svg';
import UploadIcon from '@/assets/icons/ui/upload-simple.svg';
import XIcon from '@/assets/icons/ui/x.svg';
import { Text } from '@/src/components/common';
import { POSTURE_MAX_BYTES, postureVideoProblem, postureVideoType } from '@/src/features/exercise/postureFlow';
import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';

const RECORD_SECONDS = 10;
const MAX_VIDEO_BYTES = POSTURE_MAX_BYTES;
const cameraBackground = '#1B1E21';
const muted = '#A7AAAE';
const recordingRed = '#FF4D55';

function deleteCameraCache(uri: string | null) {
  if (!uri?.startsWith('file://')) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Cache cleanup is best effort; the file is never uploaded or retained in app state.
  }
}

function deletePickedCache(uri: string | null) {
  if (Platform.OS === 'web') return;
  if (uri?.startsWith(Paths.cache.uri)) deleteCameraCache(uri);
}

function FramingGuide({ height }: { height: number }) {
  const styles = useThemedStyles(createStyles);
  // Only where to stand: a drawn person read as fake on top of the real camera.
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.guide, { height }]} />;
}

export default function PostureCaptureScreen() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const params = useLocalSearchParams<{ source?: string; exerciseCode?: string; cameraView?: string; name?: string }>();
  const initialSource = params.source;
  const exerciseLabel = `${params.name || '스쿼트'} · ${params.cameraView === 'front' ? '앞에서' : '옆에서'}`;
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const cameraRef = useRef<CameraView>(null);
  const recordingRef = useRef(false);
  const discardRecordingRef = useRef(false);
  const recordingStartedAtRef = useRef(0);
  const activeRef = useRef(false);
  const recordedUriRef = useRef<string | null>(null);
  const pickedCacheUriRef = useRef<string | null>(null);
  const albumPromptedRef = useRef(false);
  const durationRef = useRef(0);
  const videoRef = useRef<{ uri: string; mimeType: string; name: string; durationMs: number } | null>(null);
  // Set when the video goes to the analysis screen, which then owns the file and deletes it.
  const handedOffRef = useRef(false);
  const [focused, setFocused] = useState(false);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'recording' | 'review'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [source, setSource] = useState<'camera' | 'album'>('camera');
  const [permission, requestPermission] = useCameraPermissions();

  useFocusEffect(
    useCallback(() => {
      activeRef.current = true;
      handedOffRef.current = false;
      setReady(false);
      setPhase('idle');
      setSeconds(0);
      setFocused(true);
      return () => {
        activeRef.current = false;
        albumPromptedRef.current = false;
        discardRecordingRef.current = true;
        setFocused(false);
        cameraRef.current?.stopRecording();
        if (!handedOffRef.current) {
          deleteCameraCache(recordedUriRef.current);
          deletePickedCache(pickedCacheUriRef.current);
        }
        recordedUriRef.current = null;
        pickedCacheUriRef.current = null;
        videoRef.current = null;
      };
    }, []),
  );

  const resetCapture = useCallback(() => {
    discardRecordingRef.current = true;
    if (recordingRef.current) cameraRef.current?.stopRecording();
    deleteCameraCache(recordedUriRef.current);
    deletePickedCache(pickedCacheUriRef.current);
    recordedUriRef.current = null;
    pickedCacheUriRef.current = null;
    videoRef.current = null;
    durationRef.current = 0;
    setSeconds(0);
    setReady(false);
    setPhase('idle');
  }, []);

  const onProgress = useCallback((event: RecordingProgress) => {
    if (!recordingRef.current || discardRecordingRef.current) return;
    durationRef.current = event.duration;
    setSeconds(Math.min(RECORD_SECONDS, Math.ceil(event.duration)));
  }, []);

  const record = useCallback(async () => {
    if (!cameraRef.current || !ready || recordingRef.current || phase !== 'idle') return;
    recordingRef.current = true;
    discardRecordingRef.current = false;
    recordingStartedAtRef.current = Date.now();
    durationRef.current = 0;
    setSeconds(0);
    setPhase('recording');
    let capturedUri: string | null = null;
    try {
      const result = await cameraRef.current.recordAsync({
        maxDuration: RECORD_SECONDS,
        maxFileSize: MAX_VIDEO_BYTES,
        progressUpdateInterval: 0.25,
      });
      if (!result?.uri) {
        if (activeRef.current) setPhase('idle');
        return;
      }
      capturedUri = result.uri;
      if (!activeRef.current) {
        deleteCameraCache(result.uri);
        return;
      }
      if (discardRecordingRef.current) {
        deleteCameraCache(result.uri);
        setPhase('idle');
        return;
      }
      if (Math.max(durationRef.current, (Date.now() - recordingStartedAtRef.current) / 1000) < 8) {
        deleteCameraCache(result.uri);
        setPhase('idle');
        Alert.alert('촬영 시간이 짧아요', '온몸이 보이도록 약 10초 동안 촬영해 주세요.');
        return;
      }
      const file = new File(result.uri);
      const type = postureVideoType(result.uri);
      if (!file.exists || file.size < 1 || file.size > MAX_VIDEO_BYTES || !type) {
        deleteCameraCache(result.uri);
        setPhase('idle');
        Alert.alert('영상 확인 실패', '50MB 이하로 다시 촬영해 주세요.');
        return;
      }
      recordedUriRef.current = result.uri;
      videoRef.current = { uri: result.uri, ...type, durationMs: Math.round(Math.max(durationRef.current, 8) * 1000) };
      setSource('camera');
      setPhase('review');
    } catch {
      deleteCameraCache(capturedUri);
      if (activeRef.current) {
        setPhase('idle');
        Alert.alert('촬영 실패', '카메라 상태를 확인하고 다시 시도해 주세요.');
      }
    } finally {
      recordingRef.current = false;
    }
  }, [phase, ready]);

  const pickVideo = useCallback(async () => {
    if (recordingRef.current) return;
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsEditing: false,
        quality: 1,
        selectionLimit: 1,
      });
      if (picked.canceled || !picked.assets[0]) return;
      const asset = picked.assets[0];
      if (!activeRef.current) {
        deletePickedCache(asset.uri);
        return;
      }
      const type = postureVideoType(asset.uri, asset.mimeType);
      const problem = postureVideoProblem({ durationMs: asset.duration, sizeBytes: asset.fileSize, mimeType: type?.mimeType ?? null });
      if (problem || !type) {
        deletePickedCache(asset.uri);
        Alert.alert('영상 확인', problem ?? '이 영상은 분석할 수 없어요.');
        return;
      }
      pickedCacheUriRef.current = asset.uri;
      videoRef.current = { uri: asset.uri, ...type, durationMs: Math.round(asset.duration ?? 0) };
      setSource('album');
      setSeconds(Math.ceil((asset.duration ?? 0) / 1000));
      setPhase('review');
    } catch {
      Alert.alert('앨범 열기 실패', '동영상 접근 권한을 확인해 주세요.');
    }
  }, []);

  useEffect(() => {
    if (!focused || initialSource !== 'album' || albumPromptedRef.current) return;
    albumPromptedRef.current = true;
    const timer = setTimeout(() => { if (activeRef.current) void pickVideo(); }, 250);
    return () => clearTimeout(timer);
  }, [focused, initialSource, pickVideo]);

  const canUseCamera = focused && Platform.OS !== 'web' && permission?.granted;
  const guideHeight = Math.min(400, Math.max(270, screenHeight * 0.45));
  const analyze = () => {
    const video = videoRef.current;
    if (!video) return;
    handedOffRef.current = true;
    router.replace({ pathname: '/exercise/posture-processing', params: {
      videoUri: video.uri, mimeType: video.mimeType, name: video.name, durationMs: String(video.durationMs),
      exerciseCode: params.exerciseCode ?? '', cameraView: params.cameraView ?? '', label: exerciseLabel,
    } });
  };
  const close = () => {
    resetCapture();
    router.back();
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {canUseCamera && phase !== 'review' ? (
        <CameraView
          ref={cameraRef}
          facing="back"
          mode="video"
          mute
          onCameraReady={() => setReady(true)}
          onRecordingProgress={onProgress}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View pointerEvents="none" style={styles.scrim} />
      <View style={[styles.top, { paddingTop: insets.top + 14 }]}>
        <View style={styles.topRow}>
          <Pressable
            accessibilityLabel="자세 촬영 닫기"
            accessibilityRole="button"
            onPress={close}
            style={styles.closeButton}
          >
            <XIcon color="#FFF" height={24} width={24} />
          </Pressable>
          <View style={styles.recordBadge}>
            <View style={[styles.recordDot, phase === 'recording' && styles.recordDotActive]} />
            <Text style={styles.badgeText}>
              {phase === 'recording' ? '녹화 중' : phase === 'review' ? '촬영 완료' : '촬영 준비'}{' '}
              {phase === 'review' && source === 'album' ? `${seconds}초` : `${String(seconds).padStart(2, '0')} / 10초`}
            </Text>
          </View>
          <View style={styles.exerciseBadge}>
            <Text style={styles.badgeText}>{exerciseLabel}</Text>
          </View>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.min(100, seconds * 10)}%` }]} />
        </View>
      </View>

      <View style={styles.center} pointerEvents="none">
        <Text style={styles.framingLabel}>{params.cameraView === 'front' ? '앞을 보고' : '옆으로 서서'} 머리부터 발끝까지 이 선 안에</Text>
        <FramingGuide height={guideHeight} />
      </View>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        {phase === 'review' ? (
          <View style={styles.review}>
            <Text style={styles.reviewTitle}>
              {source === 'camera' ? '10초 촬영을 마쳤어요' : '앨범 영상을 선택했어요'}
            </Text>
            <Text style={styles.reviewCopy}>
              분석하면 영상을 서버로 보내고, 분석이 끝나면 서버에서 바로 지워요.
            </Text>
            <View style={styles.reviewActions}>
              <Pressable accessibilityRole="button" onPress={resetCapture} style={styles.retakeButton}>
                <Text style={styles.retakeText}>다시 찍기</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={analyze} style={styles.analyzeButton}>
                <Text style={styles.analyzeText}>분석하기</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.tip}>
              <Text style={styles.tipText}>
                온몸이 보이도록 카메라를 놓고 천천히 3~5회 해 주세요
              </Text>
            </View>
            <Text style={styles.autoStop}>10초가 지나면 자동으로 멈춰요</Text>
            <View style={styles.controls}>
              <Pressable
                accessibilityRole="button"
                onPress={() => void pickVideo()}
                style={styles.sideControl}
              >
                <View style={styles.sideIcon}><UploadIcon color="#FFF" height={22} width={22} /></View>
                <Text style={styles.sideLabel}>앨범</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={phase === 'recording' ? '녹화 멈추기' : '자세 촬영 시작'}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canUseCamera || !ready }}
                disabled={!canUseCamera || !ready}
                onPress={() =>
                  phase === 'recording' ? cameraRef.current?.stopRecording() : void record()
                }
                style={[styles.shutter, (!canUseCamera || !ready) && styles.shutterDisabled]}
              >
                <View style={phase === 'recording' ? styles.shutterStop : styles.shutterStart} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={resetCapture}
                style={styles.sideControl}
              >
                <View style={styles.sideIcon}><RetryIcon color="#FFF" height={22} width={22} /></View>
                <Text style={styles.sideLabel}>다시</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      {phase !== 'review' && (!permission?.granted || Platform.OS === 'web') ? (
        <View style={styles.permissionPanel}>
          <Pressable accessibilityRole="button" onPress={close} style={styles.permissionClose}>
            <Text style={styles.permissionCloseText}>닫기</Text>
          </Pressable>
          <Text style={styles.permissionTitle}>카메라 접근이 필요합니다</Text>
          <Text style={styles.permissionCopy}>
            스쿼트 자세를 10초 동안 촬영합니다. 음성은 녹음하지 않습니다.
          </Text>
          {Platform.OS === 'web' ? (
            <Text style={styles.permissionCopy}>기기 앱에서 카메라를 사용할 수 있습니다.</Text>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                void (permission?.canAskAgain ? requestPermission() : Linking.openSettings())
              }
              style={styles.permissionButton}
            >
              <Text style={styles.permissionButtonText}>
                {permission?.canAskAgain === false ? '설정 열기' : '카메라 허용'}
              </Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => void pickVideo()}
            style={styles.albumFallback}
          >
            <Text style={styles.albumFallbackText}>앨범에서 30초 이하 영상 선택</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    root: { flex: 1, backgroundColor: cameraBackground },
    scrim: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: 'rgba(12,14,16,0.38)',
    },
    top: { paddingHorizontal: 16, backgroundColor: 'rgba(12,14,16,0.86)', paddingBottom: 15 },
    topRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
    closeButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: '#151719',
      alignItems: 'center',
      justifyContent: 'center',
    },
    recordBadge: {
      backgroundColor: '#101214',
      borderRadius: 20,
      paddingHorizontal: 11,
      paddingVertical: 9,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    exerciseBadge: {
      backgroundColor: '#101214',
      borderRadius: 20,
      paddingHorizontal: 9,
      paddingVertical: 9,
    },
    badgeText: { color: '#FFF', fontSize: 12, fontFamily: fontFamilies.pretendardBold },
    recordDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#81858A' },
    recordDotActive: { backgroundColor: recordingRed },
    progressTrack: {
      height: 4,
      borderRadius: 2,
      marginTop: 14,
      backgroundColor: '#62666B',
      overflow: 'hidden',
    },
    progressFill: { height: 4, backgroundColor: recordingRed },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    framingLabel: {
      color: '#FFF',
      fontSize: 12,
      fontFamily: fontFamilies.pretendardBold,
      backgroundColor: '#111316',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 16,
      overflow: 'hidden',
    },
    guide: {
      width: 240,
      borderWidth: 2,
      borderColor: colors.border,
      borderStyle: 'dashed',
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 8,
    },
    bottom: {
      backgroundColor: '#101113',
      alignItems: 'center',
      paddingTop: 16,
      minHeight: 178,
      paddingHorizontal: 20,
    },
    tip: { backgroundColor: '#11191A', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7 },
    tipText: { color: '#E2E8E7', fontSize: 12, fontFamily: fontFamilies.pretendardBold, textAlign: 'center' },
    autoStop: {
      color: muted,
      fontSize: 12,
      backgroundColor: '#181A1D',
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: 14,
      marginTop: 8,
      overflow: 'hidden',
    },
    controls: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      marginTop: 15,
    },
    sideControl: { alignItems: 'center', minWidth: 60, gap: 4 },
    sideIcon: {
      width: 39,
      height: 39,
      borderRadius: 20,
      backgroundColor: '#313337',
      alignItems: 'center',
      justifyContent: 'center',
    },
    sideLabel: { color: '#F1F1F1', fontSize: 12 },
    shutter: {
      width: 72,
      height: 72,
      borderRadius: 36,
      borderWidth: 5,
      borderColor: '#FFF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    shutterDisabled: { opacity: 0.45 },
    shutterStart: { width: 30, height: 30, borderRadius: 7, backgroundColor: recordingRed },
    shutterStop: { width: 25, height: 25, borderRadius: 5, backgroundColor: recordingRed },
    review: { alignItems: 'center', gap: 10, paddingVertical: 7 },
    reviewTitle: { color: '#FFF', fontSize: 18, fontFamily: fontFamilies.pretendardBold },
    reviewCopy: { color: '#D6D9DC', fontSize: 12, textAlign: 'center' },
    retakeButton: {
      marginTop: 8,
      backgroundColor: colors.background,
      borderRadius: 12,
      paddingHorizontal: 30,
      paddingVertical: 13,
    },
    retakeText: { color: colors.textPrimary, fontSize: 16, fontFamily: fontFamilies.pretendardBold },
    reviewActions: { flexDirection: 'row', gap: 10 },
    analyzeButton: { marginTop: 8, backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 30, paddingVertical: 13 },
    analyzeText: { color: '#FFF', fontSize: 16, fontFamily: fontFamilies.pretendardBold },
    permissionPanel: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: '#1B1E21',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 28,
      gap: 16,
    },
    permissionClose: { position: 'absolute', top: 55, right: 24, padding: 8 },
    permissionCloseText: { color: '#FFF', fontSize: 16 },
    permissionTitle: { color: '#FFF', fontSize: 18, fontFamily: fontFamilies.pretendardBold },
    permissionCopy: { color: '#D6D9DC', fontSize: 14, textAlign: 'center', lineHeight: 22 },
    permissionButton: {
      backgroundColor: colors.background,
      paddingVertical: 13,
      paddingHorizontal: 22,
      borderRadius: 12,
    },
    permissionButtonText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold },
    albumFallback: { paddingVertical: 10, paddingHorizontal: 16 },
    albumFallbackText: { color: '#FFF', fontSize: 14, textDecorationLine: 'underline' },
  } as const;
}
