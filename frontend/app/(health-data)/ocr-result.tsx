import { forgetUploadedFile, rememberUploadedFile, uploadedFileFor } from '@/src/features/health-data/healthUploadSession';
import { logError } from '@/src/lib/logError';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
  type ViewStyle } from 'react-native';
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
import CaretLeftIcon from '@/assets/icons/ui/caret-left.svg';
import FileIcon from '@/assets/icons/ui/file-text.svg';
import HouseIcon from '@/assets/icons/ui/house.svg';
import PencilIcon from '@/assets/icons/ui/pencil-simple.svg';
import ShieldCheckIcon from '@/assets/icons/ui/shield-check.svg';
import WarningIcon from '@/assets/icons/ui/warning-circle.svg';
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
  CustomScrollIndicator,
  useCustomScrollIndicator,
  Text,
  TextInput,
} from '@/src/components/common';
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog';
import { HealthDataUploadBottomSheet, useHealthFileSelect } from '@/src/components/health-data/HealthDataUploadBottomSheet';
import {
  type HealthCheckupOCRResult,
  type InbodyOCRResult,
  type OCRResultItem,
  mapHealthDocumentToOCRResult,
} from '@/src/features/health-data/ocrResults';
import { type SelectedHealthFile } from '@/src/features/health-data/useHealthFilePicker';
import { fontFamilies, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

const referenceWidth = 412;
const referenceHeight = 917;
const referenceTitleTop = 38;
const keyboardSafeGap = 16;
const baseBottomContentPadding = 20;
const webInnerScrollStyle =
  Platform.OS === 'web' ? ({ overscrollBehavior: 'contain' } as ViewStyle) : undefined;

const loadingResult: OCRResultItem = {
  apiData: {},
  data: {
    hdlCholesterol: '',
    ldlCholesterol: '',
    triglycerides: '',
    ast: '',
    alt: '',
    gammaGtp: '',
    creatinine: '',
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const clock = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${clock} 올림`;
}

function parseUploadRouteItems(value?: string) {
  return (value ?? '').split(',').filter(Boolean).map((uploadedFileId) => ({ file: uploadedFileFor(uploadedFileId), uploadedFileId }));
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
    label: '키',
    unit: 'cm',
  },
  {
    Icon: WeightIcon,
    iconKind: 'stroke',
    inputKind: 'decimal',
    keyboardType: 'decimal-pad',
    key: 'weight',
    label: '몸무게',
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
  {
    Icon: CholesterolIcon,
    iconKind: 'stroke',
    inputKind: 'integer',
    keyboardType: 'numeric',
    key: 'hdlCholesterol',
    label: 'HDL 콜레스테롤',
    unit: 'mg/dL',
  },
  {
    Icon: CholesterolIcon,
    iconKind: 'stroke',
    inputKind: 'integer',
    keyboardType: 'numeric',
    key: 'ldlCholesterol',
    label: 'LDL 콜레스테롤',
    unit: 'mg/dL',
  },
  {
    Icon: CholesterolIcon,
    iconKind: 'stroke',
    inputKind: 'integer',
    keyboardType: 'numeric',
    key: 'triglycerides',
    label: '중성지방',
    unit: 'mg/dL',
  },
  {
    Icon: CholesterolIcon,
    iconKind: 'stroke',
    inputKind: 'integer',
    keyboardType: 'numeric',
    key: 'ast',
    label: 'AST',
    unit: 'U/L',
  },
  {
    Icon: CholesterolIcon,
    iconKind: 'stroke',
    inputKind: 'integer',
    keyboardType: 'numeric',
    key: 'alt',
    label: 'ALT',
    unit: 'U/L',
  },
  {
    Icon: CholesterolIcon,
    iconKind: 'stroke',
    inputKind: 'integer',
    keyboardType: 'numeric',
    key: 'gammaGtp',
    label: '감마지티피',
    unit: 'U/L',
  },
  {
    Icon: CholesterolIcon,
    iconKind: 'stroke',
    inputKind: 'decimal',
    keyboardType: 'decimal-pad',
    key: 'creatinine',
    label: '크레아티닌',
    unit: 'mg/dL',
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
      hdl_cholesterol: nullableText(values.hdlCholesterol),
      ldl_cholesterol: nullableText(values.ldlCholesterol),
      triglycerides: nullableText(values.triglycerides),
      ast: nullableText(values.ast),
      alt: nullableText(values.alt),
      gamma_gtp: nullableText(values.gammaGtp),
      creatinine: nullableText(values.creatinine),
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
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const box = isEditing ? (
    <View style={styles.metricInputBox}>
      {definition.inputKind === 'bloodPressure' ? (
        <>
          <TextInput
            accessibilityLabel="수축기 혈압"
            autoFocus
            keyboardType="numeric"
            maxLength={3}
            onChangeText={(text) => onChangeSystolicDraft(text.replace(/[^0-9]/g, ''))}
            returnKeyType="next"
            selectionColor={colors.primary}
            style={[styles.metricInput, styles.bloodPressureInput]}
            value={systolicDraft}
          />
          <Text style={styles.metricUnit}>/</Text>
          <TextInput
            accessibilityLabel="이완기 혈압"
            keyboardType="numeric"
            maxLength={3}
            onChangeText={(text) => onChangeDiastolicDraft(text.replace(/[^0-9]/g, ''))}
            onSubmitEditing={onToggleEdit}
            returnKeyType="done"
            selectionColor={colors.primary}
            style={[styles.metricInput, styles.bloodPressureInput]}
            value={diastolicDraft}
          />
        </>
      ) : (
        <TextInput
          accessibilityLabel={definition.label}
          autoFocus
          keyboardType={definition.keyboardType}
          maxLength={definition.inputKind === 'date' ? 8 : undefined}
          onChangeText={(text) => onChangeDraft(sanitizeMetricInput(text, definition.inputKind))}
          onSubmitEditing={onToggleEdit}
          returnKeyType="done"
          selectionColor={colors.primary}
          style={styles.metricInput}
          value={draftValue}
        />
      )}
      {definition.unit ? <Text style={styles.metricUnit}>{definition.unit}</Text> : null}
    </View>
  ) : null;
  return (
    <View ref={onRowRef} style={styles.metricRow}>
      <Text style={styles.metricLabel}>{definition.label}</Text>
      {isEditing ? box : (
        <Text numberOfLines={1} style={styles.metricValueText}>
          {value}{definition.unit && value ? ` ${definition.unit}` : ''}
        </Text>
      )}
      <Pressable
        accessibilityLabel={`${definition.label} ${isEditing ? '저장' : '고치기'}`}
        accessibilityRole="button"
        disabled={disabled}
        hitSlop={8}
        onPress={onToggleEdit}
        style={({ pressed }) => [isEditing ? styles.saveButton : styles.modifyButton, pressed && styles.pressed]}
      >
        {isEditing ? <Text style={styles.saveText}>저장</Text> : <PencilIcon color={colors.textPrimary} height={20} width={20} />}
      </Pressable>
    </View>
  );
}

export default function OCRResultScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { source, uploads } = useLocalSearchParams<{
    source?: string;
    uploads?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const uploadItems = useMemo(() => parseUploadRouteItems(uploads), [uploads]);
  const uploadedFileIds = useRef<string[]>([]);
  useEffect(() => {
    uploadedFileIds.current = uploadItems.map((item) => item.uploadedFileId);
    // Leaving this screen ends the only use of the local copies of these health documents.
    return () => uploadedFileIds.current.forEach(forgetUploadedFile);
  }, [uploadItems]);
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
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);

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
        logError('Health document result load failed', error);
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
          logError('Health document OCR status refresh failed', error);
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
  const currentResult = results[currentIndex] ?? loadingResult;
  const completionTop = 76;
  const uploadFileTop = 118;
  const tabsTop = 195;
  const extractedCardTop = 252;
  // The list takes spare height on a tall screen; a short one scrolls with the button below it.
  const bottomButtonTop = (windowHeight - insets.bottom - safeTopAdjustment) / scale - 76;
  const extractedCardHeight = Math.max(380, bottomButtonTop - 44 - 12 - extractedCardTop);
  const privacyTop = extractedCardTop + extractedCardHeight + 12;
  const nextButtonTop = privacyTop + 44;
  const contentBottom = Math.max(measuredContentBottom, nextButtonTop + 56);
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
  const hasUnsavedEdits =
    editingMetricKey !== null ||
    metricDefinitions.some(
      (definition) =>
        (metricValues[definition.key] ?? '') !==
        ((currentResult.data as Record<string, string>)[definition.key] ?? ''),
    );
  const goHome = () => {
    Keyboard.dismiss();
    setLeaveDialogOpen(false);
    router.replace('/home');
  };

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

    const currentValue = metricValues[key] ?? '';
    if (key === 'bloodPressure') {
      const [systolic = '', diastolic = ''] = currentValue.split('/').map((part) => part.trim());
      setSystolicDraft(systolic);
      setDiastolicDraft(diastolic);
    } else {
      const isDate = metricDefinitions.find((definition) => definition.key === key)?.inputKind === 'date';
      setDraftValue(isDate ? currentValue.replace(/[^0-9]/g, '') : currentValue);
    }

    editingMetricKeyRef.current = key;
    setEditingMetricKey(key);
  };

  const handleReuploadSelection = async (file: SelectedHealthFile) => {
    if (isReuploading || isSaving) return;

    setIsReuploading(true);
    try {
      const uploaded = await uploadHealthDocument(file);
      rememberUploadedFile(uploaded.uploaded_file_id, file);
      uploadedFileIds.current.push(uploaded.uploaded_file_id);
      const response = await getHealthDocument(uploaded.uploaded_file_id);
      const nextResult = mapHealthDocumentToOCRResult(response, file);
      setResults((current) =>
        current.map((result, index) => (index === currentIndex ? nextResult : result)),
      );
      setMetricValues({ ...nextResult.data });
      setEditingMetricKey(null);
      setIsReuploadSheetOpen(false);
    } catch (error) {
      logError('Health document reupload failed', error);
      Alert.alert('다시 업로드하지 못했어요.', getHealthDocumentErrorMessage(error));
    } finally {
      setIsReuploading(false);
    }
  };
  const failureSelect = useHealthFileSelect(handleReuploadSelection, isReuploading || isSaving);
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
      logError('Health document save or confirm failed', error);
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
        <ActivityIndicator color={colors.primaryText} />
      </View>
    );
  }

  if (currentResult.ocrStatus === 'failed' || currentResult.status === 'failed') {
    return (
      <View style={styles.failureRoot}>
        <View style={[styles.failureHeader, { paddingTop: insets.top + 4 }]}>
          <Pressable hitSlop={12} accessibilityRole="button" accessibilityLabel="뒤로 가기" onPress={handleBack} style={styles.failureBack}>
            <CaretLeftIcon color={colors.textPrimary} height={24} width={24} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.failureContent} showsVerticalScrollIndicator={false}>
          <View style={styles.failureIcon}><WarningIcon color={colors.warning} height={32} width={32} /></View>
          <Text style={styles.failureTitle}>글자를 읽지 못했어요</Text>
          <Text style={styles.failureDescription}>사진이 흐리거나 결과지 일부가 잘렸을 수 있어요.</Text>
          <View style={styles.failureGuide}>
            <Text style={styles.failureGuideTitle}>다시 찍을 때는</Text>
            {[
              '밝은 곳에서 그림자 없이 찍어 주세요',
              '결과지 네 모서리가 모두 보이게 해 주세요',
              '글자가 흔들리지 않게 가까이 찍어 주세요',
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
            onPress={failureSelect.selectPhoto}
            style={styles.failureButton}
          >
            <Text style={styles.failureButtonText}>{isReuploading ? '업로드 중…' : '다시 찍기'}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isReuploading || isSaving }}
            disabled={isReuploading || isSaving}
            onPress={failureSelect.selectDocument}
            style={styles.failureSecondary}
          >
            <Text style={styles.failureSecondaryText}>파일에서 고르기</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View ref={screenViewportRef} style={styles.root}>
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
            <Pressable accessibilityLabel="뒤로 가기" accessibilityRole="button" hitSlop={12} onPress={handleBack} style={styles.backButton}>
              <CaretLeftIcon color={colors.textPrimary} height={24} width={24} />
            </Pressable>
            <Text style={styles.screenTitle}>판독 결과 확인</Text>
            <Pressable
              accessibilityLabel="홈으로 가기"
              accessibilityRole="button"
              hitSlop={12}
              onPress={() => (hasUnsavedEdits ? setLeaveDialogOpen(true) : goHome())}
              style={styles.homeButton}
            >
              <HouseIcon color={colors.textPrimary} height={24} width={24} />
            </Pressable>

            <Text style={[styles.completionTitle, { top: completionTop }]}>
              {currentResult.ocrStatus === 'completed'
                ? '읽어 온 수치를 확인해 주세요'
                : '건강 수치를 읽고 있어요'}
            </Text>

            <AppCard
              bordered
              padding="none"
              style={[styles.uploadFileCard, { top: uploadFileTop }]}
            >
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
                    <FileIcon color={colors.textPrimary} height={22} width={22} />
                  )}
                </View>
                <View style={styles.fileTexts}>
                  <Text numberOfLines={1} style={styles.fileName}>
                    {uploadedFile.name}
                  </Text>
                  <Text style={styles.uploadTime}>{uploadTimestamp}</Text>
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
            </AppCard>

            <View style={[styles.resultTabs, { top: tabsTop }]}>
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
              <View style={styles.metricListViewport}>
                <ScrollView
                  key={currentResult.id}
                  ref={metricListScrollRef}
                  bounces={false}
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
                <CustomScrollIndicator {...innerScrollIndicator.indicatorProps} rightInset={3} />
              </View>
            </AppCard>

            <View style={[styles.privacyBox, { top: privacyTop }]}>
              <ShieldCheckIcon color={colors.textSecondary} height={18} width={18} />
              <Text style={styles.privacyText}>
                {currentResult.ocrStatus === 'completed'
                  ? '읽어 온 수치는 분석과 추천에만 써요.'
                  : '판독이 끝나면 읽어 온 수치를 확인할 수 있어요.'}
              </Text>
            </View>

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
              <Text style={[styles.nextButtonText, (isSaving || isReuploading || currentResult.ocrStatus !== 'completed') && styles.disabledText]}>
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
      <ConfirmDialog
        description="고친 내용은 저장되지 않아요."
        onPrimary={goHome}
        onSecondary={() => setLeaveDialogOpen(false)}
        primaryLabel="나가기"
        secondaryLabel="계속 확인"
        title="홈으로 나갈까요?"
        visible={leaveDialogOpen}
      />
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  return {
    failureRoot: { flex: 1, alignSelf: 'center', width: '100%', maxWidth: 412, backgroundColor: colors.background },
    failureHeader: { minHeight: 52, justifyContent: 'center', paddingHorizontal: 20 },
    failureBack: { justifyContent: 'center', minHeight: 44, width: 44 },
    failureContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 12 },
    failureIcon: { alignItems: 'center', backgroundColor: colors.warningLight, borderRadius: 32, height: 64, justifyContent: 'center', width: 64 },
    failureTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 22, lineHeight: 30, marginTop: 20 },
    failureDescription: { color: colors.textBody, fontSize: 16, lineHeight: 24, marginTop: 4 },
    failureGuide: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, gap: 12, marginTop: 20, padding: 18 },
    failureGuideTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 16, lineHeight: 24 },
    failureTipRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
    failureTipNumber: { backgroundColor: colors.background, borderRadius: 12, color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 12, height: 24, lineHeight: 24, overflow: 'hidden', textAlign: 'center', width: 24 },
    failureTipText: { color: colors.textBody, flex: 1, fontSize: 14, lineHeight: 21 },
    failureFooter: { gap: 8, paddingHorizontal: 20, paddingTop: 8 },
    failureButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 12, height: 56, justifyContent: 'center' },
    failureButtonText: { color: '#FFFFFF', fontFamily: fontFamilies.pretendardBold, fontSize: 16 },
    failureSecondary: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 12, height: 56, justifyContent: 'center' },
    failureSecondaryText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 16 },
    loadingRoot: { alignItems: 'center', backgroundColor: colors.background, flex: 1, justifyContent: 'center' },
    root: { backgroundColor: colors.background, flex: 1, overflow: 'hidden' },
    scrollContent: { alignItems: 'center' },
    canvasSlot: { position: 'relative', width: '100%' },
    canvas: { height: referenceHeight, position: 'absolute', transformOrigin: 'top left', width: referenceWidth },
    backButton: { height: 44, justifyContent: 'center', left: 20, position: 'absolute', top: 20, width: 44 },
    screenTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 16, left: 70, lineHeight: 24, position: 'absolute', right: 70, textAlign: 'center', top: 30 },
    homeButton: { alignItems: 'flex-end', height: 44, justifyContent: 'center', position: 'absolute', right: 20, top: 20, width: 44 },
    completionTitle: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardBold, fontSize: 22, left: 20, lineHeight: 30, position: 'absolute', right: 20 },
    uploadFileCard: { backgroundColor: colors.surface, borderRadius: 16, left: 20, position: 'absolute', width: 372 },
    uploadFileBottom: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 63, paddingHorizontal: 14 },
    filePreview: { alignItems: 'center', backgroundColor: colors.background, borderRadius: 20, height: 40, justifyContent: 'center', overflow: 'hidden', width: 40 },
    filePreviewImage: { height: '100%', width: '100%' },
    fileTexts: { flex: 1, minWidth: 0 },
    fileName: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14, lineHeight: 21 },
    uploadTime: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
    reuploadButton: { alignItems: 'center', backgroundColor: colors.background, borderColor: colors.border, borderRadius: 8, borderWidth: 1, height: 34, justifyContent: 'center', paddingHorizontal: 12 },
    reuploadText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
    resultTabs: { backgroundColor: colors.surfaceMuted, borderRadius: 16, flexDirection: 'row', height: 46, left: 20, padding: 4, position: 'absolute', width: 372 },
    resultTab: { alignItems: 'center', borderRadius: 12, flex: 1, justifyContent: 'center' },
    resultTabActive: { backgroundColor: colors.background },
    resultTabText: { color: colors.textSecondary, fontSize: 14 },
    resultTabTextActive: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium },
    extractedCard: { backgroundColor: colors.surface, borderRadius: 16, left: 20, overflow: 'hidden', position: 'absolute', width: 372 },
    metricListViewport: { height: '100%', position: 'relative', width: '100%' },
    metricList: { flex: 1, width: '100%' },
    metricRow: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', gap: 8, minHeight: 56, paddingHorizontal: 16 },
    metricLabel: { color: colors.textBody, fontSize: 14, lineHeight: 21, width: 96 },
    metricValueText: { color: colors.textPrimary, flex: 1, fontFamily: fontFamilies.pretendardBold, fontSize: 16, textAlign: 'right' },
    metricInputBox: { alignItems: 'center', backgroundColor: colors.background, borderColor: colors.primary, borderRadius: 12, borderWidth: 2, flex: 1, flexDirection: 'row', gap: 4, height: 44, minWidth: 0, paddingHorizontal: 10 },
    metricInput: { color: colors.textPrimary, flex: 1, fontFamily: fontFamilies.pretendardBold, fontSize: 16, minWidth: 0, padding: 0 },
    bloodPressureInput: { textAlign: 'center' },
    metricUnit: { color: colors.textSecondary, fontSize: 14 },
    modifyButton: { alignItems: 'center', height: 34, justifyContent: 'center', width: 28 },
    saveButton: { alignItems: 'center', backgroundColor: colors.background, borderColor: colors.border, borderRadius: 8, borderWidth: 1, height: 34, justifyContent: 'center', paddingHorizontal: 12 },
    saveText: { color: colors.textPrimary, fontFamily: fontFamilies.pretendardMedium, fontSize: 14 },
    privacyBox: { alignItems: 'center', flexDirection: 'row', gap: 6, left: 20, position: 'absolute', right: 20 },
    privacyText: { color: colors.textSecondary, flex: 1, fontSize: 14, lineHeight: 21 },
    nextButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 12, height: 56, justifyContent: 'center', left: 20, position: 'absolute', width: 372 },
    nextButtonDisabled: { backgroundColor: colors.surfaceMuted },
    disabledText: { color: colors.textDisabled },
    nextButtonText: { color: '#FFFFFF', fontFamily: fontFamilies.pretendardBold, fontSize: 16 },
    pressed: { opacity: 0.72 },
  } as const;
}
