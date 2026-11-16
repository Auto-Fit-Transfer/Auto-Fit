import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraView, useCameraPermissions, type RecordingProgress } from 'expo-camera';
import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Alert, Linking, Platform, StyleSheet } from 'react-native';
import { getApiErrorMessage } from '@/src/api/client';
import { getPostureCapabilities, type PostureCapability } from '@/src/api/posture';
import { PostureShootView, PostureTips } from '@/src/components/a/PostureViews';
import { POSTURE_MAX_BYTES, postureVideoProblem, postureVideoType } from '@/src/features/exercise/postureFlow';

const RECORD_SECONDS = 10;
const MAX_VIDEO_BYTES = POSTURE_MAX_BYTES;

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

// Renewal A's 자세 분석, filming (src/components/a/PostureViews.tsx shows it). What used to be two
// screens is one: which exercise (the list the server has validated) and the camera. This file keeps
// the recording going and hands the take to the analysis screen; /exercise/posture-check opens it too.
export default function PostureCaptureScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ source?: string; exerciseCode?: string; cameraView?: string; name?: string }>();
  const initialSource = params.source;
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
  const [exercises, setExercises] = useState<PostureCapability[] | null>(null);
  const [selected, setSelected] = useState(0);
  const [listError, setListError] = useState('');
  const [listTry, setListTry] = useState(0);
  const [tipsOpen, setTipsOpen] = useState(false);

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

  // Only what production has validated is offered; the app never fixes the list itself.
  // Coming back to film again (from a result), the exercise that was filmed is the one picked.
  useEffect(() => {
    let active = true;
    void getPostureCapabilities()
      .then((data) => {
        if (!active) return;
        const validated = data.exercises.filter((item) => item.validation_status === 'validated');
        setExercises(validated);
        setSelected(Math.max(0, validated.findIndex((item) => item.exercise_code === params.exerciseCode && item.camera_view === params.cameraView)));
        setListError('');
      })
      .catch((cause) => { if (active) setListError(getApiErrorMessage(cause)); });
    return () => { active = false; };
  }, [listTry, params.cameraView, params.exerciseCode]);

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

  const current = exercises?.[selected] ?? null;
  const cameraView = current?.camera_view ?? (params.cameraView === 'front' ? 'front' : 'side');
  const exerciseCode = current?.exercise_code ?? params.exerciseCode ?? '';
  const exerciseLabel = `${current?.display_name_ko ?? (params.name || '스쿼트')} · ${cameraView === 'front' ? '앞에서' : '옆에서'}`;
  // shortcut: the server sends no posture of the body; a lying frame is guessed from the code (it sends squat and lunge today). Ask for a field when a lying exercise is validated.
  const lie = /push|plank|bridge/.test(exerciseCode);
  const canUseCamera = focused && Platform.OS !== 'web' && permission?.granted;
  const analyze = () => {
    const video = videoRef.current;
    if (!video) return;
    handedOffRef.current = true;
    router.replace({ pathname: '/exercise/posture-processing', params: {
      videoUri: video.uri, mimeType: video.mimeType, name: video.name, durationMs: String(video.durationMs),
      exerciseCode, cameraView, label: exerciseLabel,
    } });
  };
  const close = () => {
    resetCapture();
    router.back();
  };
  const switchTo = (path: '/exercise' | '/exercise/running') => {
    resetCapture();
    router.replace(path);
  };

  const cover = phase === 'review'
    ? { title: source === 'camera' ? '10초 촬영을 마쳤어요' : '앨범 영상을 골랐어요', lines: ['영상은 분석에만 쓰고,\n끝나면 서버에서 바로 지워요'] }
    : listError
      ? { title: '운동을 불러오지 못했어요', lines: [listError], action: { label: '다시 시도', onPress: () => { setListError(''); setListTry((value) => value + 1); } } }
      : exercises && !current
        ? { title: '지금은 분석할 수 있는\n운동이 없어요', lines: [] }
        : Platform.OS === 'web'
          ? { title: '카메라는 휴대폰 앱에서\n쓸 수 있어요', lines: [] }
          : !permission?.granted
            ? {
                title: '카메라를 써도 될까요?',
                lines: ['자세를 10초 동안 찍어요.\n소리는 녹음하지 않아요.'],
                action: {
                  label: permission?.canAskAgain === false ? '설정 열기' : '카메라 허용',
                  onPress: () => void (permission?.canAskAgain ? requestPermission() : Linking.openSettings()),
                },
              }
            : null;

  return (
    <>
      <StatusBar style="dark" />
      <PostureShootView
        camera={canUseCamera && phase !== 'review' ? (
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
        canStart={Boolean(canUseCamera && ready && current)}
        chipsOff={phase === 'recording'}
        cover={cover}
        exercises={exercises ? exercises.map((item) => (item.camera_view === 'front' ? `${item.display_name_ko} · 앞에서` : item.display_name_ko)) : null}
        frameLabel={lie ? '몸 옆면이 보이게, 머리부터 발끝까지 이 선 안에' : `${cameraView === 'front' ? '앞을 보고' : '옆으로 서서'} 머리부터 발끝까지 이 선 안에`}
        hint={phase === 'review' ? '' : '천천히 3~5회 · 10초가 지나면 자동으로 멈춰요'}
        kinds={[
          { label: '오늘의 운동', onPress: () => switchTo('/exercise') },
          { label: '러닝', onPress: () => switchTo('/exercise/running') },
          { label: '자세 분석', selected: true, onPress: () => undefined },
        ]}
        lie={lie}
        onAlbum={() => void pickVideo()}
        onAnalyze={analyze}
        onBack={close}
        onRetake={resetCapture}
        onSelect={setSelected}
        onStart={() => void record()}
        onStop={() => cameraRef.current?.stopRecording()}
        onTips={() => setTipsOpen(true)}
        phase={phase}
        seconds={seconds}
        selected={selected}
        total={RECORD_SECONDS}
      />
      <PostureTips
        limits={current?.limitations ?? []}
        lines={current?.capture_instructions ?? ['온몸이 보이도록 카메라를 놓고 천천히 3~5회 해 주세요.']}
        onClose={() => setTipsOpen(false)}
        visible={tipsOpen}
      />
    </>
  );
}
