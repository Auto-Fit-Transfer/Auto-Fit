import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, TextInput, View } from 'react-native';

import FileTextIcon from '@/assets/icons/ui/file-text.svg';
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
import {
  AppButton,
  AppDialog,
  IconButton,
  noWebFocusRing,
  SegmentedControl,
  Text,
} from '@/src/components/common';
import { SubScreen } from '@/src/components/navigation';
import { getHealthFileProblem } from '@/src/features/health-data/healthUpload';
import {
  type HealthCheckupOCRResult,
  type InbodyOCRResult,
  type OCRResultItem,
  mapHealthDocumentToOCRResult,
} from '@/src/features/health-data/ocrResults';
import {
  type SelectedHealthFile,
  useHealthFilePicker,
} from '@/src/features/health-data/useHealthFilePicker';
import { radius, scaleForEasyMode, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

import { HealthDataUploadBottomSheet } from './HealthDataUploadBottomSheet';

type OCRMetricKey = keyof HealthCheckupOCRResult | keyof InbodyOCRResult;
type MetricValues = Record<string, string>;

interface MetricDefinition {
  inputKind: 'bloodPressure' | 'date' | 'decimal' | 'integer';
  key: OCRMetricKey;
  label: string;
  unit: string;
}

type EditingState = { key: OCRMetricKey; draft: string; systolic: string; diastolic: string };

const checkupMetrics: MetricDefinition[] = [
  { inputKind: 'date', key: 'checkupDate', label: '검진일', unit: '' },
  { inputKind: 'decimal', key: 'height', label: '키', unit: 'cm' },
  { inputKind: 'decimal', key: 'weight', label: '몸무게', unit: 'kg' },
  { inputKind: 'decimal', key: 'bmi', label: 'BMI', unit: '' },
  { inputKind: 'bloodPressure', key: 'bloodPressure', label: '혈압', unit: 'mmHg' },
  { inputKind: 'integer', key: 'fastingBloodSugar', label: '공복혈당', unit: 'mg/dL' },
  { inputKind: 'integer', key: 'totalCholesterol', label: '총콜레스테롤', unit: 'mg/dL' },
  { inputKind: 'decimal', key: 'hemoglobin', label: '혈색소', unit: 'g/dL' },
];

const inbodyMetrics: MetricDefinition[] = [
  { inputKind: 'date', key: 'measurementDate', label: '측정일', unit: '' },
  { inputKind: 'decimal', key: 'height', label: '키', unit: 'cm' },
  { inputKind: 'decimal', key: 'weight', label: '체중', unit: 'kg' },
  { inputKind: 'decimal', key: 'skeletalMuscleMass', label: '골격근량', unit: 'kg' },
  { inputKind: 'decimal', key: 'bodyFatMass', label: '체지방량', unit: 'kg' },
  { inputKind: 'decimal', key: 'bodyFatPercentage', label: '체지방률', unit: '%' },
  { inputKind: 'decimal', key: 'bmi', label: 'BMI', unit: '' },
  { inputKind: 'integer', key: 'basalMetabolicRate', label: '기초대사량', unit: 'kcal' },
  { inputKind: 'integer', key: 'visceralFatLevel', label: '내장지방 레벨', unit: '' },
];

const retakeTips = [
  '밝은 곳에서 그림자 없이 찍어 주세요',
  '결과지 네 모서리가 모두 보이게 해 주세요',
  '글자가 흔들리지 않게 가까이 찍어 주세요',
];

export function selectedFileFromResult(result: OCRResultItem): SelectedHealthFile {
  return {
    mimeType: result.fileMimeType,
    name: result.fileName,
    source: result.fileSource,
    uri: result.previewUri ?? '',
  };
}

function isFailed(result: OCRResultItem) {
  return result.ocrStatus === 'failed' || result.status === 'failed';
}

function isReading(result: OCRResultItem) {
  return result.ocrStatus === 'pending' || result.ocrStatus === 'processing';
}

// "10월 26일 09:13 올림"
function formatUploadTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${time} 올림`;
}

function displayValue(definition: MetricDefinition, value: string) {
  if (!value) return '';
  if (definition.inputKind === 'date') return value.replaceAll('.', '. ');
  return definition.unit ? `${value} ${definition.unit}` : value;
}

// The tab names; two sheets of the same kind get a number.
function resultLabels(results: OCRResultItem[]) {
  const totals = new Map<string, number>();
  results.forEach((result) => totals.set(result.type, (totals.get(result.type) ?? 0) + 1));
  const seen = new Map<string, number>();
  return results.map((result) => {
    const base = result.type === 'health_checkup' ? '건강검진' : '인바디';
    const count = (seen.get(result.type) ?? 0) + 1;
    seen.set(result.type, count);
    return (totals.get(result.type) ?? 0) > 1 ? `${base} ${count}` : base;
  });
}

function sanitizeDecimalInput(text: string) {
  const sanitized = text.replace(/[^0-9.]/g, '');
  const [integer = '', ...decimals] = sanitized.split('.');
  return decimals.length > 0 ? `${integer}.${decimals.join('')}` : integer;
}

function sanitizeMetricInput(text: string, inputKind: MetricDefinition['inputKind']) {
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
  values: MetricValues,
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

// The server calls the review needs; the development preview passes stand-ins.
export type OCRReviewApi = {
  refresh: (result: OCRResultItem) => Promise<OCRResultItem>;
  upload: (file: SelectedHealthFile) => Promise<OCRResultItem>;
  save: (result: OCRResultItem, values: MetricValues) => Promise<OCRResultItem>;
  confirm: (result: OCRResultItem) => Promise<void>;
};

export const healthDocumentReviewApi: OCRReviewApi = {
  refresh: async (result) =>
    mapHealthDocumentToOCRResult(
      await getHealthDocument(result.uploadedFileId),
      selectedFileFromResult(result),
    ),
  upload: async (file) => {
    const uploaded = await uploadHealthDocument(file);
    return mapHealthDocumentToOCRResult(await getHealthDocument(uploaded.uploaded_file_id), file);
  },
  save: async (result, values) =>
    mapHealthDocumentToOCRResult(
      await updateHealthDocumentOcrResult(result.uploadedFileId, {
        extracted_data: buildExtractedDataUpdate(result, values),
      }),
      selectedFileFromResult(result),
    ),
  confirm: async (result) => {
    await confirmHealthDocument(result.uploadedFileId);
  },
};

export interface OCRReviewProps {
  initialResults: OCRResultItem[];
  finishLabel: string;
  onBack: () => void;
  onHome: () => void;
  onFinished: () => void;
  api?: OCRReviewApi;
}

// Figma B3 (판독 결과 확인) and B5 (판독 실패); the B4 sheet sends a new sheet in place of this one.
export function OCRReview({
  initialResults,
  finishLabel,
  onBack,
  onHome,
  onFinished,
  api = healthDocumentReviewApi,
}: OCRReviewProps) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { pickDocument, takePhoto } = useHealthFilePicker();
  const [results, setResults] = useState(initialResults);
  const [valuesById, setValuesById] = useState<Record<string, MetricValues>>(() =>
    Object.fromEntries(initialResults.map((result) => [result.id, { ...result.data }])),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isReuploading, setIsReuploading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isReuploadSheetOpen, setIsReuploadSheetOpen] = useState(false);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [leaveTarget, setLeaveTarget] = useState<'back' | 'home' | null>(null);

  // Sheets still being read are asked again every two seconds.
  useEffect(() => {
    const pendingResults = results.filter(isReading);
    if (pendingResults.length === 0) return;

    let isActive = true;
    const timeout = setTimeout(() => {
      void Promise.all(pendingResults.map((result) => api.refresh(result)))
        .then((updatedResults) => {
          if (!isActive) return;
          const byId = new Map(updatedResults.map((result) => [result.id, result]));
          setResults((current) => current.map((result) => byId.get(result.id) ?? result));
          setValuesById((current) => ({
            ...current,
            ...Object.fromEntries(updatedResults.map((result) => [result.id, { ...result.data }])),
          }));
        })
        .catch((error) => {
          if (__DEV__) console.error('Health document OCR status refresh failed:', error);
        });
    }, 2000);

    return () => {
      isActive = false;
      clearTimeout(timeout);
    };
  }, [api, results]);

  const currentResult = results[currentIndex] ?? results[0];
  const metricDefinitions =
    currentResult?.type === 'body_composition' ? inbodyMetrics : checkupMetrics;
  const currentValues = currentResult ? (valuesById[currentResult.id] ?? {}) : {};
  const labels = resultLabels(results);
  const busy = isSaving || isReuploading;

  // Writes the open field into the values; returns the new values, or null when it is not valid.
  const commitEdit = () => {
    if (!editing || !currentResult) return valuesById;
    const definition = metricDefinitions.find((item) => item.key === editing.key);
    const previous = currentValues[editing.key] ?? '';
    let next = editing.draft.replace(/\.$/, '');

    if (definition?.inputKind === 'date') {
      const formatted = editing.draft ? formatCheckupDate(editing.draft) : '';
      if (formatted === null) {
        Alert.alert('날짜를 확인해 주세요', '20251020처럼 8자리 숫자로 적어 주세요.');
        return null;
      }
      next = formatted;
    } else if (definition?.inputKind === 'bloodPressure') {
      if (Boolean(editing.systolic) !== Boolean(editing.diastolic)) {
        Alert.alert('혈압을 확인해 주세요', '두 칸을 모두 적어 주세요.');
        return null;
      }
      next = editing.systolic ? `${editing.systolic} / ${editing.diastolic}` : '';
    }

    const nextValues = {
      ...valuesById,
      [currentResult.id]: { ...currentValues, [editing.key]: next },
    };
    if (next !== previous) setIsDirty(true);
    setValuesById(nextValues);
    setEditing(null);
    return nextValues;
  };

  const startEdit = (definition: MetricDefinition) => {
    if (editing && commitEdit() === null) return;
    const value = currentValues[definition.key] ?? '';
    const [systolic = '', diastolic = ''] = value.split('/').map((part) => part.trim());
    setEditing({
      key: definition.key,
      draft: definition.inputKind === 'date' ? value.replace(/\D/g, '') : value,
      systolic,
      diastolic,
    });
  };

  const selectResult = (id: string) => {
    if (commitEdit() === null) return;
    const index = results.findIndex((result) => result.id === id);
    if (index >= 0) setCurrentIndex(index);
  };

  const reupload = async (file: SelectedHealthFile) => {
    if (busy) return;
    setIsReuploading(true);
    try {
      const nextResult = await api.upload(file);
      setResults((current) =>
        current.map((result, index) => (index === currentIndex ? nextResult : result)),
      );
      setValuesById((current) => ({ ...current, [nextResult.id]: { ...nextResult.data } }));
      setEditing(null);
      setIsReuploadSheetOpen(false);
    } catch (error) {
      console.error('Health document reupload failed:', error);
      Alert.alert('다시 올리지 못했어요', getHealthDocumentErrorMessage(error));
    } finally {
      setIsReuploading(false);
    }
  };

  const pickAndReupload = async (kind: SelectedHealthFile['source']) => {
    if (busy) return;
    const file = await (kind === 'camera' ? takePhoto() : pickDocument());
    if (!file) return;
    const problem = getHealthFileProblem(file);
    if (problem) {
      Alert.alert('올릴 수 없는 파일이에요', problem);
      return;
    }
    await reupload(file);
  };

  const leave = (target: 'back' | 'home') => {
    Keyboard.dismiss();
    if (target === 'home') onHome();
    else onBack();
  };

  // Long input screen: leaving with changed values asks once (Figma I1).
  const requestLeave = (target: 'back' | 'home') => {
    if (isDirty || editing) setLeaveTarget(target);
    else leave(target);
  };

  const handleNext = async () => {
    if (busy || results.length === 0) return;
    const values = commitEdit();
    if (values === null) return;

    if (results.some(isReading)) {
      Alert.alert('아직 읽고 있어요', '조금 뒤에 다시 눌러 주세요.');
      return;
    }
    const failedIndex = results.findIndex(isFailed);
    if (failedIndex >= 0) {
      setCurrentIndex(failedIndex);
      return;
    }

    setIsSaving(true);
    try {
      const savedResults = await Promise.all(
        results.map((result) =>
          result.status === 'confirmed' ? result : api.save(result, values[result.id] ?? {}),
        ),
      );
      await Promise.all(savedResults.map((result) => api.confirm(result)));
      setResults(savedResults.map((result) => ({ ...result, status: 'confirmed' })));
      setIsDirty(false);
    } catch (error) {
      console.error('Health document save or confirm failed:', error);
      Alert.alert('수치를 저장하지 못했어요', getHealthDocumentErrorMessage(error));
      return;
    } finally {
      setIsSaving(false);
    }

    Keyboard.dismiss();
    onFinished();
  };

  const leaveDialog = (
    <AppDialog
      cancelText="계속 확인하기"
      confirmText="나가기"
      description="고친 수치는 아직 저장되지 않았어요. 그래도 나갈까요?"
      onCancel={() => setLeaveTarget(null)}
      onConfirm={() => {
        const target = leaveTarget;
        setLeaveTarget(null);
        if (target) leave(target);
      }}
      title="고친 내용이 사라져요"
      visible={leaveTarget !== null}
    />
  );

  const tabs =
    results.length > 1 ? (
      <SegmentedControl
        onChange={selectResult}
        options={results.map((result, index) => ({ value: result.id, label: labels[index] }))}
        value={currentResult?.id ?? ''}
      />
    ) : null;

  if (!currentResult) return null;

  if (isFailed(currentResult)) {
    return (
      <>
        <SubScreen
          footer={
            <>
              <AppButton
                disabled={busy}
                loading={isReuploading}
                onPress={() => void pickAndReupload('camera')}
                title="다시 찍기"
              />
              <AppButton
                disabled={busy}
                onPress={() => void pickAndReupload('document')}
                title="파일에서 고르기"
                variant="secondary"
              />
            </>
          }
          gap={24}
          onBack={() => requestLeave('back')}
        >
          {tabs}
          <View style={styles.failHeading}>
            <View style={styles.warningCircle}>
              <WarningIcon color={colors.warning} height={32} width={32} />
            </View>
            <Text accessibilityRole="header" style={styles.title}>
              글자를 읽지 못했어요
            </Text>
            <Text style={styles.description}>사진이 흐리거나 결과지 일부가 잘렸을 수 있어요.</Text>
          </View>
          <View style={styles.tipsCard}>
            <Text style={styles.tipsTitle}>다시 찍을 때는</Text>
            {retakeTips.map((tip, index) => (
              <View key={tip} style={styles.tipRow}>
                <View style={styles.tipNumber}>
                  <Text style={styles.tipNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>
        </SubScreen>
        {leaveDialog}
      </>
    );
  }

  const reading = isReading(currentResult);

  return (
    <>
      <SubScreen
        footer={
          <AppButton
            disabled={reading || isReuploading}
            loading={isSaving}
            onPress={() => void handleNext()}
            title={finishLabel}
          />
        }
        gap={16}
        onBack={() => requestLeave('back')}
        right={
          <IconButton
            accessibilityLabel="홈으로"
            icon={<HouseIcon color={colors.textPrimary} height={24} width={24} />}
            onPress={() => requestLeave('home')}
            size={44}
          />
        }
        title="판독 결과 확인"
      >
        <Text accessibilityRole="header" style={styles.title}>
          읽어 온 수치를 확인해 주세요
        </Text>
        <View style={styles.fileRow}>
          <FileTextIcon color={colors.textSecondary} height={22} width={22} />
          <View style={styles.flex}>
            <Text numberOfLines={1} style={styles.fileName}>
              {currentResult.fileName}
            </Text>
            <Text style={styles.caption}>{formatUploadTime(currentResult.uploadedAt)}</Text>
          </View>
          <AppButton
            disabled={busy}
            fullWidth={false}
            onPress={() => setIsReuploadSheetOpen(true)}
            size="S"
            title="다시 올리기"
            variant="outline"
          />
        </View>
        {tabs}
        {reading ? (
          <View style={styles.readingCard}>
            <ActivityIndicator color={colors.textSecondary} />
            <Text style={styles.readingTitle}>결과지를 읽고 있어요</Text>
            <Text style={styles.caption}>잠시만 기다려 주세요.</Text>
          </View>
        ) : (
          <View style={styles.metricCard}>
            {metricDefinitions.map((definition, index) => (
              <MetricRow
                key={definition.key}
                definition={definition}
                disabled={busy || currentResult.status !== 'awaiting_review'}
                editing={editing?.key === definition.key ? editing : null}
                first={index === 0}
                onChangeEditing={setEditing}
                onEdit={() => startEdit(definition)}
                onSave={() => void commitEdit()}
                value={currentValues[definition.key] ?? ''}
              />
            ))}
          </View>
        )}
        <View style={styles.noteRow}>
          <ShieldCheckIcon color={colors.textSecondary} height={18} width={18} />
          <Text style={styles.caption}>읽어 온 수치는 분석과 추천에만 써요.</Text>
        </View>
      </SubScreen>
      <HealthDataUploadBottomSheet
        isBusy={busy}
        onClose={() => setIsReuploadSheetOpen(false)}
        onSelectFile={reupload}
        visible={isReuploadSheetOpen}
      />
      {leaveDialog}
    </>
  );
}

function MetricRow({
  definition,
  disabled,
  editing,
  first,
  onChangeEditing,
  onEdit,
  onSave,
  value,
}: {
  definition: MetricDefinition;
  disabled: boolean;
  editing: EditingState | null;
  first: boolean;
  onChangeEditing: (next: EditingState) => void;
  onEdit: () => void;
  onSave: () => void;
  value: string;
}) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const shown = displayValue(definition, value);

  return (
    <View style={[styles.metricRow, !first && styles.metricDivider]}>
      <Text style={styles.metricLabel}>{definition.label}</Text>
      {editing ? (
        <View style={styles.editGroup}>
          <View style={styles.inputBox}>
            {definition.inputKind === 'bloodPressure' ? (
              <>
                <TextInput
                  accessibilityLabel="수축기 혈압"
                  autoFocus
                  keyboardType="numeric"
                  maxLength={3}
                  onChangeText={(text) =>
                    onChangeEditing({ ...editing, systolic: text.replace(/\D/g, '') })
                  }
                  placeholder="120"
                  placeholderTextColor={colors.textDisabled}
                  style={[styles.input, styles.pressureInput]}
                  value={editing.systolic}
                />
                <Text style={styles.unit}>/</Text>
                <TextInput
                  accessibilityLabel="이완기 혈압"
                  keyboardType="numeric"
                  maxLength={3}
                  onChangeText={(text) =>
                    onChangeEditing({ ...editing, diastolic: text.replace(/\D/g, '') })
                  }
                  onSubmitEditing={onSave}
                  placeholder="80"
                  placeholderTextColor={colors.textDisabled}
                  returnKeyType="done"
                  style={[styles.input, styles.pressureInput]}
                  value={editing.diastolic}
                />
              </>
            ) : (
              <TextInput
                accessibilityLabel={definition.label}
                autoFocus
                keyboardType={definition.inputKind === 'decimal' ? 'decimal-pad' : 'numeric'}
                maxLength={definition.inputKind === 'date' ? 8 : 7}
                onChangeText={(text) =>
                  onChangeEditing({
                    ...editing,
                    draft: sanitizeMetricInput(text, definition.inputKind),
                  })
                }
                onSubmitEditing={onSave}
                placeholder={definition.inputKind === 'date' ? '20251020' : undefined}
                placeholderTextColor={colors.textDisabled}
                returnKeyType="done"
                style={styles.input}
                value={editing.draft}
              />
            )}
            {definition.unit ? <Text style={styles.unit}>{definition.unit}</Text> : null}
          </View>
          <AppButton fullWidth={false} onPress={onSave} size="S" title="저장" variant="outline" />
        </View>
      ) : (
        <View style={styles.valueGroup}>
          <Text style={shown ? styles.metricValue : styles.metricEmpty}>{shown || '—'}</Text>
          <IconButton
            accessibilityLabel={`${definition.label} 고치기`}
            disabled={disabled}
            icon={<PencilIcon color={colors.textSecondary} height={18} width={18} />}
            onPress={onEdit}
            size={36}
          />
        </View>
      )}
    </View>
  );
}

function createStyles({ colors, text, easyMode }: AppTheme) {
  // TextInput is not the shared Text, so it is enlarged here for the easy mode.
  const inputText = easyMode ? scaleForEasyMode(text.body1Strong) : text.body1Strong;
  return {
    flex: { flex: 1 },
    title: { ...text.title1, color: colors.textPrimary },
    description: { ...text.body1, color: colors.textSecondary },
    caption: { ...text.caption, color: colors.textSecondary },
    fileRow: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.button,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 12,
      paddingLeft: 16,
      paddingRight: 12,
      paddingVertical: 12,
    },
    fileName: { ...text.body2Strong, color: colors.textPrimary },
    metricCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.card,
      borderWidth: 1,
      paddingHorizontal: 16,
    },
    metricRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      minHeight: easyMode ? 64 : 56,
      paddingVertical: 8,
    },
    metricDivider: { borderTopColor: colors.border, borderTopWidth: 1 },
    metricLabel: { ...text.body2, color: colors.textSecondary, minWidth: 64 },
    valueGroup: {
      alignItems: 'center',
      flex: 1,
      flexDirection: 'row',
      gap: 4,
      justifyContent: 'flex-end',
      marginRight: -8,
    },
    metricValue: { ...text.body1Strong, color: colors.textPrimary, textAlign: 'right' },
    metricEmpty: { ...text.body1, color: colors.textDisabled },
    editGroup: {
      alignItems: 'center',
      flex: 1,
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'flex-end',
    },
    inputBox: {
      alignItems: 'center',
      backgroundColor: colors.background,
      borderColor: colors.primary,
      borderRadius: 10,
      borderWidth: 1.5,
      flex: 1,
      flexDirection: 'row',
      gap: 4,
      height: easyMode ? 48 : 40,
      maxWidth: 200,
      paddingHorizontal: 12,
    },
    input: {
      ...inputText,
      color: colors.textPrimary,
      flex: 1,
      lineHeight: undefined,
      minWidth: 0,
      padding: 0,
      ...noWebFocusRing,
    },
    pressureInput: { textAlign: 'center' },
    unit: { ...text.body2, color: colors.textSecondary },
    readingCard: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.card,
      borderWidth: 1,
      gap: 8,
      paddingVertical: 40,
    },
    readingTitle: { ...text.body1Strong, color: colors.textPrimary },
    noteRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
    failHeading: { gap: 8, paddingTop: 16 },
    warningCircle: {
      alignItems: 'center',
      backgroundColor: colors.warningLight,
      borderRadius: 32,
      height: 64,
      justifyContent: 'center',
      marginBottom: 12,
      width: 64,
    },
    tipsCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.card,
      borderWidth: 1,
      gap: 12,
      padding: 20,
    },
    tipsTitle: { ...text.body1Strong, color: colors.textPrimary, marginBottom: 4 },
    tipRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
    tipNumber: {
      alignItems: 'center',
      backgroundColor: colors.background,
      borderRadius: 12,
      height: 24,
      justifyContent: 'center',
      width: 24,
    },
    tipNumberText: { ...text.captionStrong, color: colors.textPrimary },
    tipText: { ...text.body2, color: colors.textBody, flex: 1 },
  } as const;
}
