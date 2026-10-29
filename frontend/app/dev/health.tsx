import { Redirect } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import BodyFatIcon from '@/assets/icons/data/BodyFat_Percentage.svg';
import DiabetesIcon from '@/assets/icons/data/Diabetes.svg';
import MuscleIcon from '@/assets/icons/data/Muscle.svg';
import type { HealthDocumentListItem } from '@/src/api/healthDocuments';
import { TotalAnalysisView } from '@/src/components/analysis/TotalAnalysisView';
import type { AnalysisDisplayData } from '@/src/components/analysis/totalAnalysisData';
import { SegmentedControl } from '@/src/components/common';
import { HealthDataManagementView } from '@/src/components/health-data/HealthDataManagementView';
import { OCRReview, type OCRReviewApi } from '@/src/components/health-data/OCRReview';
import type {
  HealthCheckupOCRResult,
  InbodyOCRResult,
  OCRResultItem,
} from '@/src/features/health-data/ocrResults';
import { useAppTheme } from '@/src/theme';

const noop = () => {};
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Sample values copied from the Figma screens (B3 판독 결과 확인, B6 종합 분석, B7 건강 데이터 관리).
const checkupData: HealthCheckupOCRResult = {
  bloodPressure: '118 / 76',
  bmi: '20.9',
  checkupDate: '2025.10.20',
  fastingBloodSugar: '104',
  height: '162.4',
  hemoglobin: '13.1',
  totalCholesterol: '186',
  weight: '55.0',
};

const inbodyData: InbodyOCRResult = {
  basalMetabolicRate: '1290',
  bmi: '20.9',
  bodyFatMass: '17.6',
  bodyFatPercentage: '32.0',
  height: '162.4',
  measurementDate: '2025.10.20',
  skeletalMuscleMass: '20.7',
  visceralFatLevel: '6',
  weight: '55.0',
};

const checkupResult: OCRResultItem = {
  apiData: {},
  data: checkupData,
  fileName: '2025_건강검진결과표.pdf',
  fileSource: 'document',
  id: 'checkup',
  ocrStatus: 'completed',
  status: 'awaiting_review',
  type: 'health_checkup',
  uploadedAt: '2025-10-26T09:13:00',
  uploadedFileId: 'checkup',
};

const inbodyResult: OCRResultItem = {
  apiData: {},
  data: inbodyData,
  fileName: '인바디_1020.jpg',
  fileSource: 'camera',
  id: 'inbody',
  ocrStatus: 'completed',
  status: 'awaiting_review',
  type: 'body_composition',
  uploadedAt: '2025-10-26T09:15:00',
  uploadedFileId: 'inbody',
};

// Stand-ins for the server: reading finishes on the next check, saving keeps the typed values.
const previewApi: OCRReviewApi = {
  refresh: async (result) => ({ ...result, ...checkupResult, id: result.id }),
  upload: async (file) => {
    await wait(600);
    return { ...checkupResult, fileName: file.name, id: `new-${file.name}` };
  },
  save: async (result) => {
    await wait(300);
    return result;
  },
  confirm: async () => {
    await wait(300);
  },
};

const analysisData: AnalysisDisplayData = {
  assessmentId: 'preview',
  headline: '근육은 지키고 체지방만 줄이기',
  summary: {
    title: '체지방 관리가 필요해요',
    description: '골격근량은 표준이고, 체지방률과 공복혈당은 기준보다 조금 높아요.',
  },
  goal: '결혼식 준비를 위한 체지방 감량',
  strategy: {
    title: '근육은 지키고 체지방만 줄이기',
    tags: ['체지방률 32% · 표준 18~28%', '골격근량 20.7kg · 표준', '공복혈당 104 · 기준 100 미만'],
    message: '단백질은 끼니마다 챙기고, 근력 운동 주 3회와 식후 걷기 15분을 함께 해 보세요.',
  },
  keyMetrics: [
    {
      id: 'skeletal_muscle_mass_kg',
      name: '골격근량',
      value: '20.7',
      unit: 'kg',
      status: '표준',
      tone: 'normal',
      icon: MuscleIcon,
      description: '',
    },
    {
      id: 'body_fat_percentage',
      name: '체지방률',
      value: '32.0',
      unit: '%',
      status: '주의',
      tone: 'warning',
      icon: BodyFatIcon,
      description: '',
    },
    {
      id: 'fasting_glucose',
      name: '공복혈당',
      value: '104',
      unit: 'mg/dL',
      status: '확인 필요',
      tone: 'warning',
      icon: DiabetesIcon,
      description: '',
    },
  ],
  reasons: [
    {
      id: 'reason-1',
      title: '체지방률이 표준보다 높아요',
      description: '체지방률 32.0%로 표준 범위 18~28%보다 높아요.',
      icon: BodyFatIcon,
      metricSummary: '체지방률',
      interpretation: '',
      additionalMetrics: [],
      sheetTitle: '체성분 관련 추가 지표',
      sheetDescription: '핵심 지표와 함께 참고한 보조 수치에요',
    },
  ],
  finalDirection: { from: '', to: '' },
  metricCriteria: [
    {
      id: 'body_fat_percentage',
      metricName: '체지방률',
      value: '32.0',
      unit: '%',
      status: '주의',
      tone: 'warning',
      icon: BodyFatIcon,
      summary: '',
      appliedRule: '여성 · 체지방률 기준 (예시)',
      ranges: [
        { id: 'r-normal', label: '정상', value: '18 ~ 28', tone: 'normal' },
        { id: 'r-caution', label: '주의', value: '28 ~ 35', tone: 'warning', isCurrent: true },
        { id: 'r-high', label: '높음', value: '35 이상', tone: 'danger' },
      ],
      referenceId: 'sample-source',
    },
  ],
  references: [
    {
      id: 'sample-source',
      title: '예시 출처 · 체지방률 판정 기준',
      organization: '예시 기관',
      documentName: '예시 자료',
      description: '',
      appliedItems: ['체지방률'],
      appliedContent: '',
      publishedAt: '2025',
      appliedSummary: '체지방률 정상 · 주의 범위를 나누는 데 썼어요.',
      originalUrl: null,
    },
  ],
  criteriaSnapshotAvailable: false,
};

const analysisHealth = {
  score: 86,
  total: 100,
  change: 5,
  message: '최근 4주 동안 꾸준히 올랐어요.',
};

const analysisHandlers = {
  onBack: noop,
  onGoExercise: noop,
  onOpenDiet: noop,
  onOpenExercise: noop,
  onOpenTier: noop,
  onRetry: noop,
  onUpload: noop,
};

const documents: HealthDocumentListItem[] = [
  ['checkup-2025', 'health_checkup', '2025_건강검진결과표.pdf', '2025-10-26T09:13:00'],
  ['inbody-1020', 'body_composition', '인바디_1020.jpg', '2025-10-20T18:02:00'],
  ['inbody-0915', 'body_composition', '인바디_0915.jpg', '2025-09-15T19:40:00'],
  ['checkup-2024', 'health_checkup', '2024_건강검진결과표.pdf', '2024-11-02T10:21:00'],
].map(([id, type, name, uploadedAt]) => ({
  document_type: type as HealthDocumentListItem['document_type'],
  file_name: name,
  original_file_name: name,
  status: 'confirmed',
  uploaded_at: uploadedAt,
  uploaded_file_id: id,
}));

const screens: Record<string, () => ReactNode> = {
  review: () => (
    <OCRReview
      api={previewApi}
      finishLabel="다음"
      initialResults={[checkupResult, inbodyResult]}
      onBack={noop}
      onFinished={noop}
      onHome={noop}
    />
  ),
  reading: () => (
    <OCRReview
      api={previewApi}
      finishLabel="다음"
      initialResults={[{ ...checkupResult, ocrStatus: 'processing', data: { ...checkupData } }]}
      onBack={noop}
      onFinished={noop}
      onHome={noop}
    />
  ),
  failed: () => (
    <OCRReview
      api={previewApi}
      finishLabel="다음"
      initialResults={[{ ...checkupResult, ocrStatus: 'failed', status: 'failed' }]}
      onBack={noop}
      onFinished={noop}
      onHome={noop}
    />
  ),
  analysis: () => (
    <TotalAnalysisView
      {...analysisHandlers}
      data={analysisData}
      error=""
      health={analysisHealth}
      state="ready"
    />
  ),
  analysisEmpty: () => (
    <TotalAnalysisView
      {...analysisHandlers}
      data={null}
      error=""
      health={{ score: null, total: 100, change: null, message: '' }}
      state="empty"
    />
  ),
  manage: () => (
    <HealthDataManagementView
      documents={documents}
      isLoading={false}
      isUploading={false}
      onBack={noop}
      onUpload={async () => false}
    />
  ),
};

const options = [
  { value: 'review', label: '확인' },
  { value: 'reading', label: '읽기' },
  { value: 'failed', label: '실패' },
  { value: 'analysis', label: '분석' },
  { value: 'analysisEmpty', label: '빈 분석' },
  { value: 'manage', label: '관리' },
] as const;

// Development-only page with the redesigned health data screens and sample data, so they can be
// checked without signing in. Open /dev/health on the web preview; /upload needs no data.
export default function DevHealth() {
  const [screen, setScreen] = useState<(typeof options)[number]['value']>('review');
  const { colors } = useAppTheme();
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      <View style={{ padding: 8 }}>
        <SegmentedControl onChange={setScreen} options={options} value={screen} />
      </View>
      <View key={screen} style={{ flex: 1 }}>
        {screens[screen]()}
      </View>
    </View>
  );
}
