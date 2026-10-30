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
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line } from 'react-native-svg';

const RECORD_SECONDS = 10;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const cameraBackground = '#1B1E21';
const muted = '#A7AAAE';
const jointGreen = '#76DDA1';
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
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.guide, { height }]}
    >
      <Svg height="100%" viewBox="0 0 220 350" width="100%">
        <Line
          stroke="#888A8E"
          strokeWidth="17"
          strokeLinecap="round"
          x1="119"
          x2="112"
          y1="82"
          y2="112"
        />
        <Line
          stroke="#888A8E"
          strokeWidth="17"
          strokeLinecap="round"
          x1="112"
          x2="94"
          y1="112"
          y2="172"
        />
        <Line
          stroke="#888A8E"
          strokeWidth="17"
          strokeLinecap="round"
          x1="112"
          x2="169"
          y1="112"
          y2="139"
        />
        <Line
          stroke="#888A8E"
          strokeWidth="17"
          strokeLinecap="round"
          x1="94"
          x2="158"
          y1="172"
          y2="205"
        />
        <Line
          stroke="#888A8E"
          strokeWidth="17"
          strokeLinecap="round"
          x1="158"
          x2="132"
          y1="205"
          y2="285"
        />
        <Line
          stroke="#888A8E"
          strokeWidth="17"
          strokeLinecap="round"
          x1="132"
          x2="164"
          y1="285"
          y2="289"
        />
        <Circle cx="119" cy="65" fill="#888A8E" r="18" />
        {[
          [119, 65],
          [117, 92],
          [106, 133],
          [94, 172],
          [169, 139],
          [158, 205],
          [132, 285],
        ].map(([x, y]) => (
          <Circle cx={x} cy={y} fill={jointGreen} key={`${x}-${y}`} r="4" />
        ))}
      </Svg>
    </View>
  );
}

export default function PostureCaptureScreen() {
  const router = useRouter();
  const { source: initialSource } = useLocalSearchParams<{ source?: string }>();
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
  const [focused, setFocused] = useState(false);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'recording' | 'review'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [source, setSource] = useState<'camera' | 'album'>('camera');
  const [permission, requestPermission] = useCameraPermissions();

  useFocusEffect(
    useCallback(() => {
      activeRef.current = true;
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
        deleteCameraCache(recordedUriRef.current);
        deletePickedCache(pickedCacheUriRef.current);
        recordedUriRef.current = null;
        pickedCacheUriRef.current = null;
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
      if (!file.exists || file.size < 1 || file.size > MAX_VIDEO_BYTES) {
        deleteCameraCache(result.uri);
        setPhase('idle');
        Alert.alert('영상 확인 실패', '25MB 이하로 다시 촬영해 주세요.');
        return;
      }
      recordedUriRef.current = result.uri;
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
      if (asset.duration == null || asset.duration <= 0 || asset.duration > RECORD_SECONDS * 1000) {
        deletePickedCache(asset.uri);
        Alert.alert('영상 길이 확인', '10초 이하인 동영상을 선택해 주세요.');
        return;
      }
      if (asset.fileSize == null || asset.fileSize > MAX_VIDEO_BYTES) {
        deletePickedCache(asset.uri);
        Alert.alert('영상 크기 확인', '25MB 이하인 동영상을 선택해 주세요.');
        return;
      }
      pickedCacheUriRef.current = asset.uri;
      setSource('album');
      setSeconds(Math.ceil(asset.duration / 1000));
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
            <Text style={styles.closeText}>×</Text>
          </Pressable>
          <View style={styles.recordBadge}>
            <View style={[styles.recordDot, phase === 'recording' && styles.recordDotActive]} />
            <Text style={styles.badgeText}>
              {phase === 'recording' ? '녹화 중' : phase === 'review' ? '촬영 완료' : '촬영 준비'}{' '}
              {String(seconds).padStart(2, '0')} / 10초
            </Text>
          </View>
          <View style={styles.exerciseBadge}>
            <Text style={styles.badgeText}>스쿼트 · 옆에서</Text>
          </View>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.min(100, seconds * 10)}%` }]} />
        </View>
      </View>

      <View style={styles.center} pointerEvents="none">
        <Text style={styles.framingLabel}>이 선 안에 머리부터 발끝까지</Text>
        <FramingGuide height={guideHeight} />
      </View>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        {phase === 'review' ? (
          <View style={styles.review}>
            <Text style={styles.reviewTitle}>
              {source === 'camera' ? '10초 촬영을 마쳤어요' : '앨범 영상을 선택했어요'}
            </Text>
            <Text style={styles.reviewCopy}>
              분석 서버 연결 전이라 전송하지 않아요. 화면을 나가면 임시 영상을 지웁니다.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={resetCapture}
              style={styles.retakeButton}
            >
              <Text style={styles.retakeText}>다시 찍기</Text>
            </Pressable>
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
                <Text style={styles.sideIcon}>⇧</Text>
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
                <Text style={styles.sideIcon}>↻</Text>
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
            <Text style={styles.albumFallbackText}>앨범에서 10초 영상 선택</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
  closeText: { color: '#FFF', fontSize: 29, lineHeight: 32 },
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
  badgeText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
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
    fontWeight: '700',
    backgroundColor: '#111316',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    overflow: 'hidden',
  },
  guide: {
    width: 240,
    borderWidth: 2,
    borderColor: '#D9DCDF',
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
  tipText: { color: '#E2E8E7', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  autoStop: {
    color: muted,
    fontSize: 11,
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
    color: '#FFF',
    fontSize: 27,
    textAlign: 'center',
    overflow: 'hidden',
  },
  sideLabel: { color: '#F1F1F1', fontSize: 11 },
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
  reviewTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  reviewCopy: { color: '#D6D9DC', fontSize: 12, textAlign: 'center' },
  retakeButton: {
    marginTop: 8,
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingHorizontal: 30,
    paddingVertical: 13,
  },
  retakeText: { color: '#222', fontSize: 15, fontWeight: '700' },
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
  permissionCloseText: { color: '#FFF', fontSize: 15 },
  permissionTitle: { color: '#FFF', fontSize: 20, fontWeight: '700' },
  permissionCopy: { color: '#D6D9DC', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  permissionButton: {
    backgroundColor: '#FFF',
    paddingVertical: 13,
    paddingHorizontal: 22,
    borderRadius: 12,
  },
  permissionButtonText: { color: '#222', fontWeight: '700' },
  albumFallback: { paddingVertical: 10, paddingHorizontal: 16 },
  albumFallbackText: { color: '#FFF', fontSize: 13, textDecorationLine: 'underline' },
});
