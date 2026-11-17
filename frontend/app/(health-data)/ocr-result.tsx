import { forgetUploadedFile, rememberUploadedFile, uploadedFileFor } from '@/src/features/health-data/healthUploadSession';
import { logError } from '@/src/lib/logError';
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Alert,
  Keyboard,
  View } from 'react-native';
import type { SvgProps } from 'react-native-svg';

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
  Text,
  TextInput,
} from '@/src/components/common';
import { aForm } from '@/src/components/a/form';
import { PaperValuesView } from '@/src/components/a/PaperValuesView';
import { PaperFailed, PaperReading } from '@/src/components/a/PaperWait';
import { AppDialog } from '@/src/components/common/AppDialog';
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

export default function OCRResultScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { source, uploads } = useLocalSearchParams<{
    source?: string;
    uploads?: string;
  }>();
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
  const [isReuploadSheetOpen, setIsReuploadSheetOpen] = useState(false);
  const [metricValues, setMetricValues] = useState<Record<string, string>>(() => ({}));
  const [editingMetricKey, setEditingMetricKey] = useState<OCRMetricKey | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [systolicDraft, setSystolicDraft] = useState('');
  const [diastolicDraft, setDiastolicDraft] = useState('');
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

  const currentResult = results[currentIndex] ?? loadingResult;
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
    setEditingMetricKey(null);
    setDraftValue('');
    setSystolicDraft('');
    setDiastolicDraft('');
    setCurrentIndex(previousIndex);
    setMetricValues({ ...previousResult.data });
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
          current.map((result, index) => (index === currentIndex ? updatedResult : result)),
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
    setEditingMetricKey(null);
    setDraftValue('');
    setSystolicDraft('');
    setDiastolicDraft('');
    setCurrentIndex(nextIndex);
    setMetricValues({ ...nextResult.data });
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

  const editing = metricDefinitions.find((definition) => definition.key === editingMetricKey) ?? null;
  const waiting = isSaving || isReuploading || currentResult.ocrStatus !== 'completed';
  const kinds = [['health_checkup', '건강검진'], ['body_composition', '인바디']] as const;

  if (isLoadingResults || results.length === 0) return <PaperReading onBack={handleBack} />;

  if (currentResult.ocrStatus === 'failed' || currentResult.status === 'failed') {
    return (
      <PaperFailed
        busy={isReuploading || isSaving}
        onBack={handleBack}
        onFile={failureSelect.selectDocument}
        onPhoto={failureSelect.selectPhoto}
        uploading={isReuploading}
      />
    );
  }

  // Still being read: the loading look, not a sheet of empty numbers.
  if (currentResult.ocrStatus === 'pending' || currentResult.ocrStatus === 'processing') {
    return <PaperReading onBack={handleBack} />;
  }

  return (
    <>
      <PaperValuesView
        busy={isSaving || isReuploading}
        canEdit={canEditCurrentResult}
        cells={metricDefinitions.map((definition) => ({ key: definition.key, label: definition.label, unit: definition.unit, value: metricValues[definition.key] ?? '' }))}
        fileName={uploadedFile.name}
        fileTime={uploadTimestamp}
        kinds={kinds.map(([type, label]) => ({ has: results.some((result) => result.type === type), label, on: currentResult.type === type, type }))}
        next={{ disabled: waiting, label: isFromHealthDataManagement ? '완료' : '다음' }}
        note={currentResult.ocrStatus === 'completed' ? '읽어 온 수치는 분석과 추천에만 써요.' : '판독이 끝나면 읽어 온 수치를 확인할 수 있어요.'}
        onBack={handleBack}
        onCell={handleMetricEdit}
        onHome={() => (hasUnsavedEdits ? setLeaveDialogOpen(true) : goHome())}
        onKind={handleSelectResultType}
        onNext={() => void handleNext()}
        onReupload={() => setIsReuploadSheetOpen(true)}
        previewUri={hasImagePreview ? uploadedFile.uri : null}
      />
      {/* The one value being changed: in the middle of the screen, clear of the keyboard. */}
      <AppDialog
        cancelText="취소"
        confirmText="저장"
        onCancel={() => setEditingMetricKey(null)}
        onConfirm={() => (editing ? handleMetricEdit(editing.key) : undefined)}
        title={editing?.label ?? ''}
        visible={editing !== null}
      >
        {editing ? (
          <View style={styles.editRow}>
            {editing.inputKind === 'bloodPressure' ? (
              <>
                <TextInput
                  accessibilityLabel="수축기 혈압"
                  autoFocus
                  keyboardType="numeric"
                  maxLength={3}
                  onChangeText={(text) => setSystolicDraft(text.replace(/[^0-9]/g, ''))}
                  returnKeyType="next"
                  selectionColor={colors.primary}
                  style={styles.input}
                  value={systolicDraft}
                />
                <Text style={styles.unit}>/</Text>
                <TextInput
                  accessibilityLabel="이완기 혈압"
                  keyboardType="numeric"
                  maxLength={3}
                  onChangeText={(text) => setDiastolicDraft(text.replace(/[^0-9]/g, ''))}
                  onSubmitEditing={() => handleMetricEdit(editing.key)}
                  returnKeyType="done"
                  selectionColor={colors.primary}
                  style={styles.input}
                  value={diastolicDraft}
                />
              </>
            ) : (
              <TextInput
                accessibilityLabel={editing.label}
                autoFocus
                keyboardType={editing.keyboardType}
                maxLength={editing.inputKind === 'date' ? 8 : undefined}
                onChangeText={(text) => setDraftValue(sanitizeMetricInput(text, editing.inputKind))}
                onSubmitEditing={() => handleMetricEdit(editing.key)}
                placeholder={editing.inputKind === 'date' ? '20261103' : undefined}
                placeholderTextColor={colors.textDisabled}
                returnKeyType="done"
                selectionColor={colors.primary}
                style={styles.input}
                value={draftValue}
              />
            )}
            {editing.unit ? <Text style={styles.unit}>{editing.unit}</Text> : null}
          </View>
        ) : null}
      </AppDialog>
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
    </>
  );
}

function createStyles({ colors }: AppTheme) {
  // The box that changes one value; the screen itself is drawn by PaperValuesView.
  const a = aForm(colors);
  return {
    editRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 8 },
    input: { backgroundColor: colors.surface, borderColor: colors.ink, borderRadius: 12, borderWidth: 2, color: colors.ink, flex: 1, fontFamily: fontFamilies.galmuri14, fontSize: 15, height: 48, paddingHorizontal: 12 },
    unit: { ...a.p12, color: colors.textSecondary },
  } as const;
}
