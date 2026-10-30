import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import type { SvgProps } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BMIIcon from '@/assets/icons/data/BMI.svg';
import BMRIcon from '@/assets/icons/data/BMR.svg';
import BloodPressureIcon from '@/assets/icons/data/BloodPressure.svg';
import BodyFatPercentageIcon from '@/assets/icons/data/BodyFat_Percentage.svg';
import CholesterolIcon from '@/assets/icons/data/Cholesterol.svg';
import DateIcon from '@/assets/icons/data/Date.svg';
import DiabetesIcon from '@/assets/icons/data/Diabetes.svg';
import FatIcon from '@/assets/icons/data/Fat.svg';
import VisceralFatIcon from '@/assets/icons/data/Fat_Level.svg';
import HeightIcon from '@/assets/icons/data/Height.svg';
import HemoglobinIcon from '@/assets/icons/data/Hemoglobin.svg';
import MuscleIcon from '@/assets/icons/data/Muscle.svg';
import WeightIcon from '@/assets/icons/data/Weight.svg';
import DocumentIcon from '@/assets/icons/system/Document.svg';
import ShieldCheckIcon from '@/assets/icons/system/ShieldCheck.svg';
import {
  confirmHealthDocument,
  getHealthDocument,
  getHealthDocumentErrorMessage,
  type BodyCompositionExtractedDataInput,
  type HealthCheckupExtractedDataInput,
  updateHealthDocumentOcrResult,
  uploadHealthDocument,
} from '@/src/api/healthDocuments';
import { awardTierActivity } from '@/src/api/tier';
import {
  AppCard,
  BackButton,
  CustomScrollIndicator,
  useCustomScrollIndicator,
} from '@/src/components/common';
import { HealthDataUploadBottomSheet } from '@/src/components/health-data/HealthDataUploadBottomSheet';
import {
  type HealthCheckupOCRResult,
  type InbodyOCRResult,
  type OCRResultItem,
  type OCRUploadRouteItem,
  mapHealthDocumentToOCRResult,
} from '@/src/features/health-data/ocrResults';
import { type SelectedHealthFile } from '@/src/features/health-data/useHealthFilePicker';
import { colors, fontFamilies, radius } from '@/src/theme';

const referenceWidth = 412;
const referenceHeight = 917;
const referenceExtractedCardHeight = 450;
const referenceTitleTop = 38;
const keyboardSafeGap = 16;
const baseBottomContentPadding = 20;
const minimumScreenHeight = 740;
const maximumScreenHeight = 917;
const webInnerScrollStyle =
  Platform.OS === 'web' ? ({ overscrollBehavior: 'contain' } as ViewStyle) : undefined;

const loadingResult: OCRResultItem = {
  apiData: {},
  data: {
    bloodPressure: '',
    bmi: '',
    checkupDate: '',
    fastingBloodSugar: '',
    height: '',
    hemoglobin: '',
    totalCholesterol: '',
    weight: '',
  },
  fileName: '',
  fileSource: 'document',
  id: 'loading',
  ocrStatus: 'pending',
  status: 'awaiting_review',
  type: 'health_checkup',
  uploadedAt: '',
  uploadedFileId: '',
};

function isImageFile(file: SelectedHealthFile) {
  if (file.mimeType?.toLowerCase().startsWith('image/')) return true;
  return /\.(avif|bmp|gif|heic|heif|jpe?g|png|webp)$/i.test(file.name);
}

function formatUploadDate(value: string) {
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.replaceAll('-', '.') : '-';
}

function parseUploadRouteItems(value?: string): OCRUploadRouteItem[] {
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is OCRUploadRouteItem => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as Partial<OCRUploadRouteItem>;
      const file = candidate.file;
      return (
        typeof candidate.uploadedFileId === 'string' &&
        typeof file === 'object' &&
        file !== null &&
        typeof file.name === 'string' &&
        typeof file.uri === 'string' &&
        (file.source === 'camera' || file.source === 'document')
      );
    });
  } catch {
    return [];
  }
}

function selectedFileFromResult(result: OCRResultItem): SelectedHealthFile {
  return {
    mimeType: result.fileMimeType,
    name: result.fileName,
    source: result.fileSource,
    uri: result.previewUri ?? '',
  };
}

type OCRMetricKey = keyof HealthCheckupOCRResult | keyof InbodyOCRResult;

interface HealthMetricDefinition {
  Icon: ComponentType<SvgProps>;
  iconKind: 'fill' | 'stroke';
  inputKind: 'bloodPressure' | 'date' | 'decimal' | 'integer';
  keyboardType: 'decimal-pad' | 'numeric';
  key: OCRMetricKey;
  label: string;
  unit: string;
}

const healthMetricDefinitions: HealthMetricDefinition[] = [
  {
    Icon: DateIcon,
    iconKind: 'fill',
    inputKind: 'date',
    keyboardType: 'numeric',
    key: 'checkupDate',
    label: '검진일',
    unit: '',
  },
  {
    Icon: HeightIcon,
    iconKind: 'fill',
    inputKind: 'decimal',
    keyboardType: 'decimal-pad',
    key: 'height',
    label: '신장',
    unit: 'cm',
  },
  {
    Icon: WeightIcon,
    iconKind: 'stroke',
    inputKind: 'decimal',
    keyboardType: 'decimal-pad',
    key: 'weight',
    label: '체중',
    unit: 'kg',
  },
  {
    Icon: BMIIcon,
    iconKind: 'stroke',
    inputKind: 'decimal',
    keyboardType: 'decimal-pad',
    key: 'bmi',
    label: 'BMI',
    unit: '',
  },
  {
    Icon: BloodPressureIcon,
    iconKind: 'fill',
    inputKind: 'bloodPressure',
    keyboardType: 'numeric',
    key: 'bloodPressure',
    label: '혈압',
    unit: 'mmHg',
  },
  {
    Icon: DiabetesIcon,
    iconKind: 'fill',
    inputKind: 'integer',
    keyboardType: 'numeric',
    key: 'fastingBloodSugar',
    label: '공복혈당',
    unit: 'mg/dL',
  },
  {
    Icon: CholesterolIcon,
    iconKind: 'stroke',
    inputKind: 'integer',
    keyboardType: 'numeric',
    key: 'totalCholesterol',
    label: '총콜레스테롤',
    unit: 'mg/dL',
  },
  {
    Icon: HemoglobinIcon,
    iconKind: 'stroke',
    inputKind: 'decimal',
    keyboardType: 'decimal-pad',
    key: 'hemoglobin',
    label: '혈색소',
    unit: 'g/dL',
  },
];

const inbodyMetricDefinitions: HealthMetricDefinition[] = [
  {
    Icon: DateIcon,
    iconKind: 'fill',
    inputKind: 'date',
    keyboardType: 'numeric',
    key: 'measurementDate',
    label: '검사일',
    unit: '',
  },
  {
    Icon: HeightIcon,
    iconKind: 'fill',
    inputKind: 'decimal',
    keyboardType: 'decimal-pad',
    key: 'height',
    label: '신장',
    unit: 'cm',
  },
  {
    Icon: WeightIcon,
    iconKind: 'stroke',
    inputKind: 'decimal',
    keyboardType: 'decimal-pad',
    key: 'weight',
    label: '체중',
    unit: 'kg',
  },
  {
    Icon: MuscleIcon,
    iconKind: 'stroke',
    inputKind: 'decimal',
    keyboardType: 'decimal-pad',
    key: 'skeletalMuscleMass',
    label: '골격근량',
    unit: 'kg',
  },
  {
    Icon: FatIcon,
    iconKind: 'fill',
    inputKind: 'decimal',
    keyboardType: 'decimal-pad',
    key: 'bodyFatMass',
    label: '체지방량',
    unit: 'kg',
  },
  {
    Icon: BodyFatPercentageIcon,
    iconKind: 'stroke',
    inputKind: 'decimal',
    keyboardType: 'decimal-pad',
    key: 'bodyFatPercentage',
    label: '체지방률',
    unit: '%',
  },
  {
    Icon: BMIIcon,
    iconKind: 'stroke',
    inputKind: 'decimal',
    keyboardType: 'decimal-pad',
    key: 'bmi',
    label: 'BMI',
    unit: '',
  },
  {
    Icon: BMRIcon,
    iconKind: 'stroke',
    inputKind: 'integer',
    keyboardType: 'numeric',
    key: 'basalMetabolicRate',
    label: '기초대사량',
    unit: 'kcal',
  },
  {
    Icon: VisceralFatIcon,
    iconKind: 'stroke',
    inputKind: 'integer',
    keyboardType: 'numeric',
    key: 'visceralFatLevel',
    label: '내장지방레벨',
    unit: '',
  },
];

function sanitizeDecimalInput(text: string) {
  const sanitized = text.replace(/[^0-9.]/g, '');
  const [integer = '', ...decimals] = sanitized.split('.');
  return decimals.length > 0 ? `${integer}.${decimals.join('')}` : integer;
}

function sanitizeMetricInput(text: string, inputKind: HealthMetricDefinition['inputKind']) {
  if (inputKind === 'decimal') return sanitizeDecimalInput(text);
  return text.replace(/\D/g, '');
}

function formatCheckupDate(value: string) {
  if (!/^\d{8}$/.test(value)) return null;

  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return `${value.slice(0, 4)}.${value.slice(4, 6)}.${value.slice(6, 8)}`;
}

function updateResultData(result: OCRResultItem, values: Record<string, string>): OCRResultItem {
  if (result.type === 'health_checkup') {
    return {
      ...result,
      data: values as unknown as HealthCheckupOCRResult,
    };
  }

  return {
    ...result,
    data: values as unknown as InbodyOCRResult,
  };
}

function nullableText(value: string | undefined) {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

function toApiDate(value: string | undefined) {
  const compactDate = (value ?? '').replace(/\D/g, '');
  if (!/^\d{8}$/.test(compactDate)) return null;
  return `${compactDate.slice(0, 4)}-${compactDate.slice(4, 6)}-${compactDate.slice(6, 8)}`;
}

function toNullableInteger(value: string | undefined) {
  const normalized = nullableText(value);
  return normalized === null ? null : Number(normalized);
}

function buildExtractedDataUpdate(
  result: OCRResultItem,
  values: Record<string, string>,
): HealthCheckupExtractedDataInput | BodyCompositionExtractedDataInput {
  if (result.type === 'health_checkup') {
    const [systolic = '', diastolic = ''] = (values.bloodPressure ?? '')
      .split('/')
      .map((value) => value.trim());
    return {
      ...result.apiData,
      bmi: nullableText(values.bmi),
      checkup_date: toApiDate(values.checkupDate),
      diastolic_bp: toNullableInteger(diastolic),
      fasting_glucose: nullableText(values.fastingBloodSugar),
      height_cm: nullableText(values.height),
      hemoglobin: nullableText(values.hemoglobin),
      systolic_bp: toNullableInteger(systolic),
      total_cholesterol: nullableText(values.totalCholesterol),
      weight_kg: nullableText(values.weight),
    };
  }

  const measuredDate = toApiDate(values.measurementDate);
  const previousMeasuredDate = result.apiData.measured_at?.slice(0, 10) ?? null;
  return {
    ...result.apiData,
    basal_metabolic_rate: nullableText(values.basalMetabolicRate),
    bmi: nullableText(values.bmi),
    body_fat_mass_kg: nullableText(values.bodyFatMass),
    body_fat_percentage: nullableText(values.bodyFatPercentage),
    height_cm: nullableText(values.height),
    measured_at:
      measuredDate === null
        ? null
        : measuredDate === previousMeasuredDate
          ? result.apiData.measured_at
          : `${measuredDate}T00:00:00.000Z`,
    skeletal_muscle_mass_kg: nullableText(values.skeletalMuscleMass),
    visceral_fat_level: nullableText(values.visceralFatLevel),
    weight_kg: nullableText(values.weight),
  };
}

function ResultStepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <View
      accessibilityLabel={`OCR 결과 확인 ${total}개 중 ${current}번째`}
      style={styles.stepIndicator}
    >
      {Array.from({ length: total }, (_, index) => index + 1).map((step, index) => (
        <View key={step} style={styles.stepGroup}>
          {index > 0 ? <View style={styles.stepLine} /> : null}
          <View style={[styles.step, step === current && styles.activeStep]}>
            <Text style={[styles.stepText, step === current && styles.activeStepText]}>{step}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function MetricRow({
  definition,
  disabled,
  diastolicDraft,
  draftValue,
  isEditing,
  onChangeDraft,
  onChangeDiastolicDraft,
  onChangeSystolicDraft,
  onRowRef,
  onToggleEdit,
  systolicDraft,
  value,
}: {
  definition: HealthMetricDefinition;
  disabled: boolean;
  diastolicDraft: string;
  draftValue: string;
  isEditing: boolean;
  onChangeDraft: (value: string) => void;
  onChangeDiastolicDraft: (value: string) => void;
  onChangeSystolicDraft: (value: string) => void;
  onRowRef: (instance: View | null) => void;
  onToggleEdit: () => void;
  systolicDraft: string;
  value: string;
}) {
  return (
    <View ref={onRowRef} style={styles.metricRow}>
      <View style={styles.metricMain}>
        <View style={styles.metricContent}>
          <Text style={styles.metricLabel}>{definition.label}</Text>
          <View style={styles.metricValue}>
            {isEditing && definition.inputKind === 'bloodPressure' ? (
              <View style={styles.bloodPressureInputs}>
                <TextInput
                  accessibilityLabel="수축기 혈압"
                  autoFocus
                  keyboardType="numeric"
                  maxLength={3}
                  onChangeText={(text) => onChangeSystolicDraft(text.replace(/\D/g, ''))}
                  returnKeyType="next"
                  selectionColor="#1371EB"
                  style={[styles.metricInput, styles.bloodPressureInput]}
                  value={systolicDraft}
                />
                <Text style={styles.bloodPressureSeparator}>/</Text>
                <TextInput
                  accessibilityLabel="이완기 혈압"
                  keyboardType="numeric"
                  maxLength={3}
                  onChangeText={(text) => onChangeDiastolicDraft(text.replace(/\D/g, ''))}
                  onSubmitEditing={onToggleEdit}
                  returnKeyType="done"
                  selectionColor="#1371EB"
                  style={[styles.metricInput, styles.bloodPressureInput]}
                  value={diastolicDraft}
                />
              </View>
            ) : isEditing ? (
              <TextInput
                autoFocus
                keyboardType={definition.keyboardType}
                maxLength={definition.inputKind === 'date' ? 8 : undefined}
                onChangeText={(text) =>
                  onChangeDraft(sanitizeMetricInput(text, definition.inputKind))
                }
                onSubmitEditing={onToggleEdit}
                returnKeyType="done"
                selectionColor="#1371EB"
                style={styles.metricInput}
                value={draftValue}
              />
            ) : (
              <Text style={styles.metricValueText}>{value}</Text>
            )}
            {definition.unit ? <Text style={styles.metricUnit}> {definition.unit}</Text> : null}
          </View>
          <Pressable
            accessibilityLabel={`${definition.label} ${isEditing ? '확인' : '수정'}`}
            accessibilityRole="button"
            disabled={disabled}
            onPress={onToggleEdit}
            style={({ pressed }) => [
              styles.modifyButton,
              isEditing && styles.confirmButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.modifyButtonText, isEditing && styles.confirmButtonText]}>
              {isEditing ? '✓' : '✎'}
            </Text>
          </Pressable>
        </View>
        <View style={styles.metricDivider} />
      </View>
    </View>
  );
}

export default function OCRResultScreen() {
  const router = useRouter();
  const { source, uploads } = useLocalSearchParams<{
    source?: string;
    uploads?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const uploadItems = useMemo(() => parseUploadRouteItems(uploads), [uploads]);
  const isFromHealthDataManagement = source === 'healthDataManagement';
  const [results, setResults] = useState<OCRResultItem[]>([]);
  const [isLoadingResults, setIsLoadingResults] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isReuploading, setIsReuploading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isInnerScrollActive, setIsInnerScrollActive] = useState(false);
  const [isReuploadSheetOpen, setIsReuploadSheetOpen] = useState(false);
  const [metricValues, setMetricValues] = useState<Record<string, string>>(() => ({}));
  const [editingMetricKey, setEditingMetricKey] = useState<OCRMetricKey | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [systolicDraft, setSystolicDraft] = useState('');
  const [diastolicDraft, setDiastolicDraft] = useState('');
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0); // 추가
  const [keyboardCanvasOffset, setKeyboardCanvasOffset] = useState(0);
  const [measuredContentBottom, setMeasuredContentBottom] = useState(0);
  const correctionFrame = useRef<number | null>(null);
  const editingMetricKeyRef = useRef<OCRMetricKey | null>(null);
  const metricRowRefs = useRef<Partial<Record<OCRMetricKey, View>>>({});
  const metricListScrollRef = useRef<ScrollView>(null);
  const keyboardCanvasOffsetRef = useRef(0);
  const screenViewportRef = useRef<View>(null);
  const innerScrollIndicator = useCustomScrollIndicator();

  useEffect(() => {
    let isActive = true;

    if (uploadItems.length === 0) {
      Alert.alert('업로드 정보가 없어요.', '건강 데이터 업로드 화면에서 다시 시도해 주세요.');
      router.back();
      return () => {
        isActive = false;
      };
    }

    const loadResults = async () => {
      setIsLoadingResults(true);
      try {
        const nextResults = await Promise.all(
          uploadItems.map(async (item) =>
            mapHealthDocumentToOCRResult(await getHealthDocument(item.uploadedFileId), item.file),
          ),
        );
        if (!isActive) return;
        setResults(nextResults);
        setCurrentIndex(0);
        setMetricValues({ ...nextResults[0].data });
      } catch (error) {
        console.error('Health document result load failed:', error);
        if (isActive) {
          Alert.alert('OCR 결과를 불러오지 못했어요.', getHealthDocumentErrorMessage(error));
          router.back();
        }
      } finally {
        if (isActive) setIsLoadingResults(false);
      }
    };

    void loadResults();
    return () => {
      isActive = false;
    };
  }, [router, uploadItems]);

  useEffect(() => {
    const pendingResults = results.filter(
      (result) => result.ocrStatus === 'pending' || result.ocrStatus === 'processing',
    );
    if (pendingResults.length === 0) return;

    let isActive = true;
    const timeout = setTimeout(() => {
      void Promise.all(
        pendingResults.map(async (result) => ({
          id: result.id,
          result: mapHealthDocumentToOCRResult(
            await getHealthDocument(result.uploadedFileId),
            selectedFileFromResult(result),
          ),
        })),
      )
        .then((updatedResults) => {
          if (!isActive) return;
          const byId = new Map(updatedResults.map((item) => [item.id, item.result]));
          setResults((current) => current.map((result) => byId.get(result.id) ?? result));
        })
        .catch((error) => {
          if (__DEV__) console.error('Health document OCR status refresh failed:', error);
        });
    }, 2000);

    return () => {
      isActive = false;
      clearTimeout(timeout);
    };
  }, [results]);

  const availableWidth = Math.max(0, windowWidth - insets.left - insets.right);
  const widthScale = Math.min(1, availableWidth / referenceWidth);
  const scale = widthScale;
  const scaledWidth = referenceWidth * widthScale;
  const canvasLeft = insets.left + (availableWidth - scaledWidth) / 2;
  const safeTopAdjustment = Math.max(0, insets.top + 8 - referenceTitleTop * scale);
  const screenHeight = Dimensions.get('screen').height;
  const responsiveHeight = Platform.OS === 'android' ? screenHeight : windowHeight;
  const heightProgress = Math.max(
    0,
    Math.min(
      1,
      (responsiveHeight - minimumScreenHeight) / (maximumScreenHeight - minimumScreenHeight),
    ),
  );
  const verticalValue = (expanded: number, compact: number) =>
    compact + (expanded - compact) * heightProgress;
  const currentResult = results[currentIndex] ?? loadingResult;
  const extractedCardHeight = referenceExtractedCardHeight;
  const completionTop = 104;
  const stepIndicatorTop = 70;
  const uploadFileTop = Math.max(204, completionTop + 50 + 20);
  const extractedCardTop = Math.max(verticalValue(359, 300), uploadFileTop + 135 + 16);
  const nextButtonTop = Math.max(
    verticalValue(830, 780),
    extractedCardTop + extractedCardHeight + 15,
  );
  const contentBottom = Math.max(measuredContentBottom, nextButtonTop + 45);
  const bottomContentPadding = baseBottomContentPadding + insets.bottom;
  const contentViewportHeight = safeTopAdjustment + contentBottom * scale;
  const renderedContentHeight = contentViewportHeight + bottomContentPadding;
  const needsScroll = contentViewportHeight > windowHeight;
  const scrollIndicator = useCustomScrollIndicator({
    enabled: needsScroll,
    showInitially: true,
  });
  const metricDefinitions =
    currentResult.type === 'health_checkup' ? healthMetricDefinitions : inbodyMetricDefinitions;
  const uploadedFile: SelectedHealthFile = {
    mimeType: currentResult.fileMimeType,
    name: currentResult.fileName,
    source: currentResult.fileSource,
    uri: currentResult.previewUri ?? '',
  };
  const uploadTimestamp = formatUploadDate(currentResult.uploadedAt);
  const hasImagePreview = uploadedFile.uri.length > 0 && isImageFile(uploadedFile);
  const canReviewCurrentResult =
    currentResult.ocrStatus === 'completed' && currentResult.status === 'awaiting_review';
  const canEditCurrentResult = canReviewCurrentResult && !isSaving && !isReuploading;

  const centerFocusedRow = useCallback(
    (key: OCRMetricKey, activeKeyboardTop: number) => {
      const row = metricRowRefs.current[key];
      const viewport = screenViewportRef.current;

      if (!row || !viewport || editingMetricKeyRef.current !== key) {
        return;
      }

      viewport.measureInWindow((_viewportX, viewportTop, _viewportWidth, viewportHeight) => {
        if (editingMetricKeyRef.current !== key) return;

        row.measureInWindow((_rowX, rowTop, _rowWidth, rowHeight) => {
          if (editingMetricKeyRef.current !== key) return;

          // 실제로 사용할 수 있는 화면의 위/아래
          const visibleTop = Math.max(viewportTop, insets.top);
          const visibleBottom = Math.min(
            viewportTop + viewportHeight,
            activeKeyboardTop - keyboardSafeGap,
          );

          // 키보드를 제외한 화면의 정확한 세로 중앙
          const visibleCenter = visibleTop + (visibleBottom - visibleTop) / 2;

          // 현재 수정 중인 Row의 세로 중앙
          const rowCenter = rowTop + rowHeight / 2;

          // Row 중심을 화면 중심으로 옮기기 위해 필요한 거리
          const deltaY = rowCenter - visibleCenter;

          const targetOffset = Math.max(0, keyboardCanvasOffsetRef.current + deltaY);

          keyboardCanvasOffsetRef.current = targetOffset;
          setKeyboardCanvasOffset(targetOffset);
        });
      });
    },
    [insets.top],
  );

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardTop(event.endCoordinates.screenY);
      setKeyboardHeight(event.endCoordinates.height); // 추가
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardTop(null);
      setKeyboardHeight(0); // 추가
      keyboardCanvasOffsetRef.current = 0;
      setKeyboardCanvasOffset(0);
      if (correctionFrame.current !== null) {
        cancelAnimationFrame(correctionFrame.current);
        correctionFrame.current = null;
      }
    });

    return () => {
      if (correctionFrame.current !== null) cancelAnimationFrame(correctionFrame.current);
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    editingMetricKeyRef.current = editingMetricKey;
    if (!editingMetricKey || keyboardTop === null) return;

    if (correctionFrame.current !== null) cancelAnimationFrame(correctionFrame.current);
    correctionFrame.current = requestAnimationFrame(() => {
      correctionFrame.current = null;

      if (editingMetricKeyRef.current === editingMetricKey) {
        centerFocusedRow(editingMetricKey, keyboardTop);
      }
    });

    return () => {
      if (correctionFrame.current !== null) {
        cancelAnimationFrame(correctionFrame.current);
        correctionFrame.current = null;
      }
    };
  }, [centerFocusedRow, editingMetricKey, keyboardTop, keyboardHeight]);

  const applyEditingDraft = (current: Record<string, string>) => {
    if (!editingMetricKey) return current;

    let nextValue = current[editingMetricKey];
    const editingDefinition = metricDefinitions.find(
      (definition) => definition.key === editingMetricKey,
    );

    if (editingDefinition?.inputKind === 'date') {
      if (draftValue.trim() !== '') {
        nextValue = formatCheckupDate(draftValue) ?? current[editingMetricKey];
      }
    } else if (editingMetricKey === 'bloodPressure') {
      if (systolicDraft && diastolicDraft) {
        nextValue = `${systolicDraft} / ${diastolicDraft}`;
      }
    } else if (draftValue.trim() !== '') {
      nextValue = draftValue;
    }

    return { ...current, [editingMetricKey]: nextValue };
  };

  const handleMetricEdit = (key: OCRMetricKey) => {
    if (editingMetricKey) {
      setMetricValues(applyEditingDraft);
    }

    if (editingMetricKey === key) {
      editingMetricKeyRef.current = null;
      setEditingMetricKey(null);
      return;
    }

    if (key === 'bloodPressure') {
      setSystolicDraft('');
      setDiastolicDraft('');
    } else {
      setDraftValue('');
    }

    editingMetricKeyRef.current = key;
    setEditingMetricKey(key);
  };

  const handleReuploadSelection = async (file: SelectedHealthFile) => {
    if (isReuploading || isSaving) return;

    setIsReuploading(true);
    try {
      const uploaded = await uploadHealthDocument(file);
      const response = await getHealthDocument(uploaded.uploaded_file_id);
      const nextResult = mapHealthDocumentToOCRResult(response, file);
      setResults((current) =>
        current.map((result, index) => (index === currentIndex ? nextResult : result)),
      );
      setMetricValues({ ...nextResult.data });
      setEditingMetricKey(null);
      setIsReuploadSheetOpen(false);
    } catch (error) {
      console.error('Health document reupload failed:', error);
      Alert.alert('다시 업로드하지 못했어요.', getHealthDocumentErrorMessage(error));
    } finally {
      setIsReuploading(false);
    }
  };
  const handleBack = () => {
    if (currentIndex === 0) {
      Keyboard.dismiss();
      router.back();
      return;
    }

    const committedValues = applyEditingDraft(metricValues);
    setMetricValues(committedValues);
    setResults((current) =>
      current.map((result, index) =>
        index === currentIndex ? updateResultData(result, committedValues) : result,
      ),
    );

    const previousIndex = currentIndex - 1;
    const previousResult = results[previousIndex];
    editingMetricKeyRef.current = null;
    metricRowRefs.current = {};
    setEditingMetricKey(null);
    setDraftValue('');
    setSystolicDraft('');
    setDiastolicDraft('');
    setCurrentIndex(previousIndex);
    setMetricValues({ ...previousResult.data });
    metricListScrollRef.current?.scrollTo({ animated: false, y: 0 });
    keyboardCanvasOffsetRef.current = 0;
    setKeyboardCanvasOffset(0);
    Keyboard.dismiss();
  };

  const handleNext = async () => {
    if (isLoadingResults || isSaving || results.length === 0) return;

    const committedValues = applyEditingDraft(metricValues);
    setMetricValues(committedValues);
    setResults((current) =>
      current.map((result, index) =>
        index === currentIndex ? updateResultData(result, committedValues) : result,
      ),
    );

    if (currentResult.ocrStatus === 'pending' || currentResult.ocrStatus === 'processing') {
      Alert.alert('OCR 결과 준비 중', 'OCR 결과가 완료된 뒤 다시 확인해 주세요.');
      return;
    }
    if (currentResult.ocrStatus === 'failed' || currentResult.status === 'failed') {
      Alert.alert('OCR 처리에 실패했어요.', '다시 업로드한 뒤 결과를 확인해 주세요.');
      return;
    }

    const isLastResult = currentIndex >= results.length - 1;
    let savedResult = updateResultData(currentResult, committedValues);

    setIsSaving(true);
    try {
      if (currentResult.status !== 'confirmed') {
        const updatedResponse = await updateHealthDocumentOcrResult(currentResult.uploadedFileId, {
          extracted_data: buildExtractedDataUpdate(currentResult, committedValues),
        });
        const updatedResult = mapHealthDocumentToOCRResult(
          updatedResponse,
          selectedFileFromResult(currentResult),
        );
        savedResult = updatedResult;
        setResults((current) =>
          current.map((result, index) => (index === currentIndex ? savedResult : result)),
        );
        setMetricValues({ ...savedResult.data });
      }

      if (isLastResult) {
        const confirmations = await Promise.all(results.map((result) => confirmHealthDocument(result.uploadedFileId)));
        for (const confirmation of confirmations) {
          const sourceId = confirmation.health_checkup_id ?? confirmation.body_composition_id;
          if (sourceId) {
            // Confirmation succeeded independently of the tier service.
            void awardTierActivity('health_data_uploaded', sourceId).catch(() => undefined);
          }
        }
        savedResult = { ...savedResult, status: 'confirmed' };
        setResults((current) => current.map((result) => ({ ...result, status: 'confirmed' })));
        setMetricValues({ ...savedResult.data });
      }
    } catch (error) {
      console.error('Health document save or confirm failed:', error);
      Alert.alert('OCR 결과를 저장하지 못했어요.', getHealthDocumentErrorMessage(error));
      return;
    } finally {
      setIsSaving(false);
    }

    if (isLastResult) {
      Keyboard.dismiss();
      if (isFromHealthDataManagement) {
        router.dismissTo('/health-data-management');
      } else {
        router.push('/total-analysis');
      }
      return;
    }

    const nextIndex = currentIndex + 1;
    const nextResult = results[nextIndex];
    editingMetricKeyRef.current = null;
    metricRowRefs.current = {};
    setEditingMetricKey(null);
    setDraftValue('');
    setSystolicDraft('');
    setDiastolicDraft('');
    setCurrentIndex(nextIndex);
    setMetricValues({ ...nextResult.data });
    metricListScrollRef.current?.scrollTo({ animated: false, y: 0 });
    keyboardCanvasOffsetRef.current = 0;
    setKeyboardCanvasOffset(0);
    Keyboard.dismiss();
  };

  const handleSelectResultType = (type: OCRResultItem['type']) => {
    if (type === currentResult.type || isSaving || isReuploading) return;
    const targetIndex = results.findIndex((result) => result.type === type);
    if (targetIndex < 0) return;
    if (targetIndex === currentIndex + 1) {
      void handleNext();
    } else if (targetIndex === currentIndex - 1) {
      handleBack();
    } else {
      Alert.alert('자료 확인 순서', '다음 또는 뒤로 버튼으로 자료를 차례대로 확인해 주세요.');
    }
  };

  const metricRows = metricDefinitions.map((definition) => (
    <MetricRow
      key={definition.key}
      definition={definition}
      disabled={!canEditCurrentResult}
      diastolicDraft={diastolicDraft}
      draftValue={editingMetricKey === definition.key ? draftValue : ''}
      isEditing={editingMetricKey === definition.key}
      onChangeDraft={setDraftValue}
      onChangeDiastolicDraft={setDiastolicDraft}
      onChangeSystolicDraft={setSystolicDraft}
      onRowRef={(instance) => {
        if (instance) {
          metricRowRefs.current[definition.key] = instance;
        } else {
          delete metricRowRefs.current[definition.key];
        }
      }}
      onToggleEdit={() => handleMetricEdit(definition.key)}
      systolicDraft={systolicDraft}
      value={metricValues[definition.key] ?? ''}
    />
  ));

  if (isLoadingResults || results.length === 0) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (currentResult.ocrStatus === 'failed' || currentResult.status === 'failed') {
    return (
      <View style={styles.failureRoot}>
        <StatusBar style="dark" />
        <View style={[styles.failureHeader, { paddingTop: insets.top + 6 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="뒤로 가기" onPress={handleBack} style={styles.failureBack}>
            <Text style={styles.failureBackText}>‹</Text>
          </Pressable>
          <Text style={styles.failureHeaderTitle}>건강 데이터 확인</Text>
        </View>
        <ScrollView contentContainerStyle={styles.failureContent} showsVerticalScrollIndicator={false}>
          <View style={styles.failureIcon}><Text style={styles.failureIconText}>!</Text></View>
          <Text style={styles.failureTitle}>글자를 읽지 못했어요</Text>
          <Text style={styles.failureDescription}>
            사진의 일부가 흐리거나 글자가 잘 보이지 않아요. 다시 촬영하거나 선명한 파일을 올려 주세요.
          </Text>
          <View style={styles.failureGuide}>
            <Text style={styles.failureGuideTitle}>다시 찍을 때는</Text>
            {[
              '밝은 곳에서 촬영해 주세요',
              '결과지를 평평하게 놓고 찍어 주세요',
              '결과지 전체가 화면에 들어오게 해 주세요',
            ].map((tip, index) => (
              <View key={tip} style={styles.failureTipRow}>
                <Text style={styles.failureTipNumber}>{index + 1}</Text>
                <Text style={styles.failureTipText}>{tip}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
        <View style={[styles.failureFooter, { paddingBottom: Math.max(insets.bottom, 18) }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isReuploading || isSaving }}
            disabled={isReuploading || isSaving}
            onPress={() => setIsReuploadSheetOpen(true)}
            style={styles.failureButton}
          >
            <Text style={styles.failureButtonText}>{isReuploading ? '업로드 중…' : '다시 올리기'}</Text>
          </Pressable>
        </View>
        <HealthDataUploadBottomSheet
          isBusy={isReuploading || isSaving}
          onClose={() => setIsReuploadSheetOpen(false)}
          onSelectFile={handleReuploadSelection}
          visible={isReuploadSheetOpen}
          variant="reupload"
        />
      </View>
    );
  }

  return (
    <View ref={screenViewportRef} style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView
        bounces={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            minHeight: Math.max(windowHeight, renderedContentHeight),
            paddingBottom: bottomContentPadding,
            paddingTop: safeTopAdjustment,
          },
        ]}
        keyboardDismissMode="none"
        keyboardShouldPersistTaps="always"
        onContentSizeChange={scrollIndicator.onContentSizeChange}
        onLayout={scrollIndicator.onLayout}
        onMomentumScrollBegin={scrollIndicator.onMomentumScrollBegin}
        onMomentumScrollEnd={scrollIndicator.onMomentumScrollEnd}
        onScroll={scrollIndicator.onScroll}
        onScrollBeginDrag={scrollIndicator.onScrollBeginDrag}
        onScrollEndDrag={scrollIndicator.onScrollEndDrag}
        overScrollMode="never"
        scrollEnabled={needsScroll && !isInnerScrollActive}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.canvasSlot, { height: contentBottom * scale }]}>
          <View
            style={[
              styles.canvas,
              {
                left: canvasLeft,
                top: -keyboardCanvasOffset,
                transform: [{ scale }],
              },
            ]}
          >
            <BackButton
              color={colors.textBody}
              onPress={handleBack}
              size={44}
              style={styles.backButton}
            />
            <Text style={styles.screenTitle}>판독 결과 확인</Text>
            {results.length > 1 ? (
              <View style={[styles.stepPosition, { top: stepIndicatorTop }]}>
                <ResultStepIndicator current={currentIndex + 1} total={results.length} />
              </View>
            ) : null}

            <View style={[styles.completionSection, { top: completionTop }]}>
              <View style={styles.completionTexts}>
                <Text
                  style={[
                    styles.completionTitle,
                    currentResult.type === 'health_checkup' && styles.healthCompletionTitle,
                  ]}
                >
                  {currentResult.ocrStatus === 'completed'
                    ? '읽어 온 수치를 확인해 주세요'
                    : '건강 수치를 읽고 있어요'}
                </Text>
                <Text
                  style={[
                    styles.completionDescription,
                    currentResult.type === 'health_checkup' && styles.healthCompletionDescription,
                  ]}
                >
                  {currentResult.ocrStatus === 'completed'
                    ? '원본 자료와 비교하고 필요한 항목은 수정해 주세요.'
                    : '판독이 끝나면 추출한 수치를 확인할 수 있어요.'}
                </Text>
              </View>
            </View>

            <AppCard
              bordered
              padding="none"
              style={[styles.uploadFileCard, { top: uploadFileTop }]}
            >
              <View style={styles.uploadFileContent}>
                <View style={styles.uploadFileBottom}>
                  <View style={styles.filePreview}>
                    {hasImagePreview ? (
                      <Image
                        accessibilityLabel={`${uploadedFile.name} 미리보기`}
                        resizeMode="cover"
                        source={{ uri: uploadedFile.uri }}
                        style={styles.filePreviewImage}
                      />
                    ) : (
                      <DocumentIcon
                        color={colors.primary}
                        fill={colors.primary}
                        height={42}
                        width={42}
                      />
                    )}
                  </View>
                  <View style={styles.fileTexts}>
                    <Text numberOfLines={1} style={styles.fileName}>
                      {uploadedFile.name}
                    </Text>
                    <Text style={styles.uploadTime}>업로드 일시 {uploadTimestamp}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isSaving || isReuploading}
                    onPress={() => setIsReuploadSheetOpen(true)}
                    style={({ pressed }) => [styles.reuploadButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.reuploadText}>다시 올리기</Text>
                  </Pressable>
                </View>
              </View>
            </AppCard>

            <View style={[styles.resultTabs, { top: extractedCardTop - 43 }]}>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: currentResult.type === 'health_checkup', disabled: !results.some((result) => result.type === 'health_checkup') }}
                disabled={!results.some((result) => result.type === 'health_checkup')}
                onPress={() => handleSelectResultType('health_checkup')}
                style={[styles.resultTab, currentResult.type === 'health_checkup' && styles.resultTabActive]}
              >
                <Text style={[styles.resultTabText, currentResult.type === 'health_checkup' && styles.resultTabTextActive]}>건강검진</Text>
              </Pressable>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: currentResult.type === 'body_composition', disabled: !results.some((result) => result.type === 'body_composition') }}
                disabled={!results.some((result) => result.type === 'body_composition')}
                onPress={() => handleSelectResultType('body_composition')}
                style={[styles.resultTab, currentResult.type === 'body_composition' && styles.resultTabActive]}
              >
                <Text style={[styles.resultTabText, currentResult.type === 'body_composition' && styles.resultTabTextActive]}>인바디</Text>
              </Pressable>
            </View>

            <AppCard
              bordered
              padding="none"
              style={[styles.extractedCard, { height: extractedCardHeight, top: extractedCardTop }]}
            >
              <View style={styles.extractedContent}>
                <View style={styles.metricListViewport}>
                  <ScrollView
                    key={currentResult.id}
                    ref={metricListScrollRef}
                    bounces={false}
                    contentContainerStyle={styles.metricListContent}
                    keyboardShouldPersistTaps="always"
                    nestedScrollEnabled
                    onContentSizeChange={innerScrollIndicator.onContentSizeChange}
                    onLayout={innerScrollIndicator.onLayout}
                    onMomentumScrollBegin={innerScrollIndicator.onMomentumScrollBegin}
                    onMomentumScrollEnd={innerScrollIndicator.onMomentumScrollEnd}
                    onScroll={innerScrollIndicator.onScroll}
                    onScrollBeginDrag={innerScrollIndicator.onScrollBeginDrag}
                    onScrollEndDrag={innerScrollIndicator.onScrollEndDrag}
                    onTouchCancel={() => setIsInnerScrollActive(false)}
                    onTouchEnd={() => setIsInnerScrollActive(false)}
                    onTouchStart={() => setIsInnerScrollActive(true)}
                    scrollEventThrottle={16}
                    showsVerticalScrollIndicator={false}
                    style={[styles.metricList, webInnerScrollStyle]}
                  >
                    {metricRows}
                  </ScrollView>
                  <CustomScrollIndicator {...innerScrollIndicator.indicatorProps} rightInset={-5} />
                </View>
                <View style={styles.privacyBox}>
                  <ShieldCheckIcon
                    color={colors.primary}
                    fill={colors.primary}
                    height={24}
                    width={24}
                  />
                  <Text style={styles.privacyText}>
                    인식한 수치를 원본 자료와 비교해 주세요. 틀린 값은 수정한 뒤 다음으로 진행할 수 있어요.
                  </Text>
                </View>
              </View>
            </AppCard>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                disabled:
                  isSaving ||
                  isReuploading ||
                  currentResult.ocrStatus !== 'completed',
              }}
              disabled={
                isSaving ||
                isReuploading ||
                currentResult.ocrStatus !== 'completed'
              }
              onPress={() => void handleNext()}
              onLayout={(event) => {
                const { height, y } = event.nativeEvent.layout;
                setMeasuredContentBottom(y + height);
              }}
              style={({ pressed }) => [
                styles.nextButton,
                { top: nextButtonTop },
                (isSaving ||
                  isReuploading ||
                  currentResult.ocrStatus !== 'completed') &&
                  styles.nextButtonDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.nextButtonText}>
                {isFromHealthDataManagement ? '완료' : '다음'}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
      {needsScroll ? (
        <CustomScrollIndicator
          {...scrollIndicator.indicatorProps}
          bottomInset={Math.max(8, insets.bottom + 4)}
          rightInset={Math.max(4, insets.right + 4)}
          topInset={Math.max(8, insets.top + 4)}
        />
      ) : null}
      <HealthDataUploadBottomSheet
        isBusy={isReuploading || isSaving}
        onClose={() => setIsReuploadSheetOpen(false)}
        onSelectFile={handleReuploadSelection}
        visible={isReuploadSheetOpen}
        variant="reupload"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  failureRoot: { flex: 1, alignSelf: 'center', width: '100%', maxWidth: 412, backgroundColor: '#FFFFFF' },
  failureHeader: { minHeight: 62, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  failureBack: { position: 'absolute', left: 20, bottom: 7, height: 42, width: 42, justifyContent: 'center', zIndex: 1 },
  failureBackText: { color: '#27262D', fontSize: 32, lineHeight: 38 },
  failureHeaderTitle: { color: '#27262D', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 16 },
  failureContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 104, alignItems: 'center' },
  failureIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#FFF4D6', alignItems: 'center', justifyContent: 'center' },
  failureIconText: { color: '#D79B1E', fontFamily: fontFamilies.pretendardBold, fontSize: 36 },
  failureTitle: { marginTop: 26, color: '#27262D', fontFamily: fontFamilies.pretendardBold, fontSize: 25 },
  failureDescription: { marginTop: 14, color: '#85858D', fontFamily: fontFamilies.pretendardRegular, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  failureGuide: { alignSelf: 'stretch', marginTop: 48, borderRadius: 18, borderWidth: 1, borderColor: '#E9E7ED', padding: 20, gap: 16 },
  failureGuideTitle: { color: '#33313A', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 16 },
  failureTipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  failureTipNumber: { color: '#8F79DF', fontFamily: fontFamilies.pretendardBold, fontSize: 14, width: 17 },
  failureTipText: { color: '#67656E', fontFamily: fontFamilies.pretendardRegular, fontSize: 14, lineHeight: 20, flex: 1 },
  failureFooter: { paddingHorizontal: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F2F0F4' },
  failureButton: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#9B82E9' },
  failureButtonText: { color: '#FFFFFF', fontFamily: fontFamilies.pretendardSemiBold, fontSize: 16 },
  loadingRoot: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    flex: 1,
    justifyContent: 'center',
  },
  root: {
    backgroundColor: colors.surface,
    flex: 1,
    overflow: 'hidden',
  },
  background: {
    ...StyleSheet.absoluteFill,
    height: '100%',
    width: '100%',
  },
  scrollContent: {
    alignItems: 'center',
  },
  canvasSlot: {
    position: 'relative',
    width: '100%',
  },
  canvas: {
    height: referenceHeight,
    position: 'absolute',
    transformOrigin: 'top left',
    width: referenceWidth,
  },
  backButton: {
    left: 12,
    position: 'absolute',
    top: 22,
  },
  screenTitle: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardBold,
    fontSize: 15,
    left: 70,
    letterSpacing: 1.5,
    lineHeight: 20,
    position: 'absolute',
    right: 70,
    textAlign: 'center',
    top: 38,
  },
  stepPosition: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 75,
  },
  stepIndicator: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 20,
    justifyContent: 'center',
  },
  stepGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
  },
  stepLine: {
    backgroundColor: colors.textDisabled,
    height: StyleSheet.hairlineWidth,
    marginLeft: 3,
    width: 37.6,
  },
  step: {
    alignItems: 'center',
    borderColor: colors.textDisabled,
    borderRadius: radius.round,
    borderWidth: 1,
    height: 17,
    justifyContent: 'center',
    width: 17,
  },
  activeStep: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  stepText: {
    color: colors.textDisabled,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 9,
    includeFontPadding: false,
    lineHeight: 11,
  },
  activeStepText: {
    color: colors.surface,
  },
  completionSection: {
    alignItems: 'flex-start',
    left: 21,
    position: 'absolute',
    top: 114,
    width: 370,
  },
  completionIconCircle: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: 25,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  completionTexts: {
    gap: 8,
    width: 370,
  },
  completionTitle: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 19,
    includeFontPadding: false,
    lineHeight: 22,
  },
  completionDescription: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 13,
    includeFontPadding: false,
    lineHeight: 17,
  },
  healthCompletionTitle: {
    fontSize: 19,
  },
  healthCompletionDescription: {
    fontSize: 14,
  },
  uploadFileCard: {
    borderRadius: 12,
    left: 21,
    position: 'absolute',
    top: 204,
    width: 370,
  },
  uploadFileContent: {
    padding: 12,
  },
  cardTitle: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 16,
    includeFontPadding: false,
    lineHeight: 17,
  },
  uploadFileBottom: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  filePreview: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 48,
  },
  filePreviewImage: {
    height: '100%',
    width: '100%',
  },
  fileTexts: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  fileName: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 14,
    includeFontPadding: false,
    lineHeight: 17,
  },
  uploadTime: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 12.5,
    includeFontPadding: false,
    lineHeight: 17,
  },
  reuploadButton: {
    alignItems: 'center',
    borderColor: '#D8D3ED',
    borderRadius: radius.sm,
    borderWidth: 0.5,
    height: 32,
    justifyContent: 'center',
    width: 78,
  },
  reuploadText: {
    color: '#6551B3',
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 12,
    includeFontPadding: false,
    lineHeight: 17,
  },
  resultTabs: {
    backgroundColor: '#F6F5F8',
    borderRadius: 9,
    flexDirection: 'row',
    height: 34,
    left: 21,
    padding: 3,
    position: 'absolute',
    width: 370,
  },
  resultTab: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  resultTabActive: { backgroundColor: '#FFFFFF', borderRadius: 7 },
  resultTabText: { color: '#96939C', fontFamily: fontFamilies.pretendardMedium, fontSize: 12 },
  resultTabTextActive: { color: '#5C50AE', fontFamily: fontFamilies.pretendardSemiBold },
  extractedCard: {
    borderRadius: 13,
    height: 450,
    left: 21,
    position: 'absolute',
    top: 359,
    width: 370,
  },
  extractedContent: {
    gap: 10,
    height: '100%',
    paddingBottom: 15,
    paddingHorizontal: 15,
    paddingTop: 16,
  },
  metricListContent: {
    gap: 0,
    paddingRight: 2,
  },
  metricList: {
    flex: 1,
    width: '100%',
  },
  metricListViewport: {
    height: 330,
    position: 'relative',
    width: 341,
  },
  metricRow: {
    minHeight: 46,
  },
  metricIconCircle: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: radius.round,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  metricMain: {
    flex: 1,
    gap: 0,
  },
  metricContent: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 45,
  },
  metricLabel: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 13,
    includeFontPadding: false,
    lineHeight: 17,
    width: 106,
  },
  metricValue: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  metricValueText: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 13,
    includeFontPadding: false,
    lineHeight: 17,
  },
  metricInput: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D9DEE5',
    borderRadius: 8,
    borderWidth: 1,

    color: colors.textBody,
    fontFamily: fontFamilies.pretendardLight,
    fontSize: 14,

    height: 28,
    includeFontPadding: false,
    lineHeight: 17,

    paddingHorizontal: 8,
    paddingVertical: 0,

    width: 92,
  },
  bloodPressureInputs: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
  },
  bloodPressureInput: {
    paddingHorizontal: 3,
    textAlign: 'center',
    width: 36,
  },
  bloodPressureSeparator: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 14,
    lineHeight: 17,
  },
  metricUnit: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 12,
    lineHeight: 17,
  },
  modifyButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 30,
  },
  modifyButtonText: {
    color: '#8A78D3',
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 20,
    includeFontPadding: false,
    lineHeight: 17,
  },
  extractedCardTitle: {
    lineHeight: 18,
  },
  confirmButton: {
    backgroundColor: '#F1EDFB',
  },
  confirmButtonText: {
    color: '#1371EB',
  },
  metricDivider: {
    backgroundColor: colors.border,
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  privacyBox: {
    alignItems: 'center',
    backgroundColor: colors.surfaceSoft,
    borderRadius: radius.lg,
    flexDirection: 'row',
    gap: 3,
    marginTop: 'auto',
    height: 50,
    paddingHorizontal: 8,
  },
  privacyText: {
    color: colors.textSecondary,
    flex: 1,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 13,
    includeFontPadding: false,
    lineHeight: 16,
  },
  privacyEmphasis: {
    color: colors.primaryDark,
  },
  nextButton: {
    alignItems: 'center',
    backgroundColor: '#5141C9',
    borderRadius: 8,
    height: 52,
    justifyContent: 'center',
    left: 21,
    position: 'absolute',
    top: 830,
    width: 370,
  },
  nextButtonDisabled: {
    opacity: 0.5,
  },
  nextButtonText: {
    color: colors.surface,
    fontFamily: fontFamilies.pretendardMedium,
    fontSize: 16,
    includeFontPadding: false,
    lineHeight: 22,
  },
  pressed: {
    opacity: 0.72,
  },
  reuploadSheetOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  reuploadSheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    minHeight: 300,
  },
  reuploadSheetHandle: {
    backgroundColor: '#D9D9D9',
    height: 4,
    marginTop: 11,
    width: 40,
  },
  reuploadSheetContent: {
    paddingBottom: 0,
    paddingHorizontal: 16,
    paddingTop: 36,
  },
  reuploadOptions: {
    flexDirection: 'row',
    gap: 20,
    justifyContent: 'center',
    width: '100%',
  },
  reuploadOptionCard: {
    flex: 1,
    maxWidth: 180,
    width: 'auto',
  },
});
