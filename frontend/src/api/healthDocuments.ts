import { Platform } from 'react-native';
import { File } from 'expo-file-system';

import { apiRequest, ApiError } from '@/src/api/client';
import type { SelectedHealthFile } from '@/src/features/health-data/useHealthFilePicker';

export type HealthDocumentType = 'body_composition' | 'health_checkup';
export type HealthDocumentOcrStatus = 'completed' | 'failed' | 'pending' | 'processing';
export type HealthDocumentStatus = 'awaiting_review' | 'confirmed' | 'failed';
type DecimalOutputValue = string | null;
type DecimalInputValue = number | string | null;

export type HealthCheckupExtractedData = {
  alt?: DecimalOutputValue;
  ast?: DecimalOutputValue;
  bmi?: DecimalOutputValue;
  checkup_date?: string | null;
  checkup_type?: string | null;
  creatinine?: DecimalOutputValue;
  diastolic_bp?: number | null;
  fasting_glucose?: DecimalOutputValue;
  gamma_gtp?: DecimalOutputValue;
  hdl_cholesterol?: DecimalOutputValue;
  height_cm?: DecimalOutputValue;
  hemoglobin?: DecimalOutputValue;
  institution_name?: string | null;
  ldl_cholesterol?: DecimalOutputValue;
  systolic_bp?: number | null;
  total_cholesterol?: DecimalOutputValue;
  triglycerides?: DecimalOutputValue;
  weight_kg?: DecimalOutputValue;
};

export type BodyCompositionExtractedData = {
  basal_metabolic_rate?: DecimalOutputValue;
  bmi?: DecimalOutputValue;
  body_fat_mass_kg?: DecimalOutputValue;
  body_fat_percentage?: DecimalOutputValue;
  body_water_liters?: DecimalOutputValue;
  body_water_percentage?: DecimalOutputValue;
  device_name?: string | null;
  height_cm?: DecimalOutputValue;
  measured_at?: string | null;
  protein_percentage?: DecimalOutputValue;
  skeletal_muscle_mass_kg?: DecimalOutputValue;
  visceral_fat_level?: DecimalOutputValue;
  weight_kg?: DecimalOutputValue;
};

export type HealthCheckupExtractedDataInput = Omit<
  HealthCheckupExtractedData,
  | 'alt'
  | 'ast'
  | 'bmi'
  | 'creatinine'
  | 'fasting_glucose'
  | 'gamma_gtp'
  | 'hdl_cholesterol'
  | 'height_cm'
  | 'hemoglobin'
  | 'ldl_cholesterol'
  | 'total_cholesterol'
  | 'triglycerides'
  | 'weight_kg'
> & {
  alt?: DecimalInputValue;
  ast?: DecimalInputValue;
  bmi?: DecimalInputValue;
  creatinine?: DecimalInputValue;
  fasting_glucose?: DecimalInputValue;
  gamma_gtp?: DecimalInputValue;
  hdl_cholesterol?: DecimalInputValue;
  height_cm?: DecimalInputValue;
  hemoglobin?: DecimalInputValue;
  ldl_cholesterol?: DecimalInputValue;
  total_cholesterol?: DecimalInputValue;
  triglycerides?: DecimalInputValue;
  weight_kg?: DecimalInputValue;
};

export type BodyCompositionExtractedDataInput = Omit<
  BodyCompositionExtractedData,
  | 'basal_metabolic_rate'
  | 'bmi'
  | 'body_fat_mass_kg'
  | 'body_fat_percentage'
  | 'body_water_liters'
  | 'body_water_percentage'
  | 'height_cm'
  | 'protein_percentage'
  | 'skeletal_muscle_mass_kg'
  | 'visceral_fat_level'
  | 'weight_kg'
> & {
  basal_metabolic_rate?: DecimalInputValue;
  bmi?: DecimalInputValue;
  body_fat_mass_kg?: DecimalInputValue;
  body_fat_percentage?: DecimalInputValue;
  body_water_liters?: DecimalInputValue;
  body_water_percentage?: DecimalInputValue;
  height_cm?: DecimalInputValue;
  protein_percentage?: DecimalInputValue;
  skeletal_muscle_mass_kg?: DecimalInputValue;
  visceral_fat_level?: DecimalInputValue;
  weight_kg?: DecimalInputValue;
};

type HealthDocumentResponseBase = {
  document_type: HealthDocumentType;
  error?: unknown | null;
  file: {
    document_type: HealthDocumentType;
    uploaded_file_id: string;
  };
  file_name: string;
  original_file_name?: string | null;
  ocr_result?: { status: HealthDocumentOcrStatus } | null;
  ocr_status: HealthDocumentOcrStatus;
  status: HealthDocumentStatus;
  uploaded_at: string;
  uploaded_file_id: string;
};

export type HealthCheckupDocumentResponse = HealthDocumentResponseBase & {
  document_type: 'health_checkup';
  extracted_data: HealthCheckupExtractedData;
};

export type BodyCompositionDocumentResponse = HealthDocumentResponseBase & {
  document_type: 'body_composition';
  extracted_data: BodyCompositionExtractedData;
};

export type HealthDocumentResponse =
  | BodyCompositionDocumentResponse
  | HealthCheckupDocumentResponse;

export type OCRResultUpdateRequest = {
  extracted_data: BodyCompositionExtractedDataInput | HealthCheckupExtractedDataInput;
};

export type HealthDocumentConfirmationResponse = {
  already_confirmed: boolean;
  body_composition_id: string | null;
  document_type: HealthDocumentType;
  health_checkup_id: string | null;
  health_data: Record<string, unknown>;
  status: 'confirmed';
  uploaded_file_id: string;
  // back-end d5b96a9a: what became of the score after this confirmation (absent on an older server)
  analysis_status?: 'saved' | 'waiting_for_documents' | 'failed' | 'unavailable';
  assessment_id?: string | null;
};

export type HealthDocumentListItem = {
  document_type: HealthDocumentType;
  file_name: string;
  original_file_name: string;
  status: HealthDocumentStatus;
  uploaded_at: string;
  uploaded_file_id: string;
};

export type HealthDocumentListResponse = {
  has_more: boolean;
  items: HealthDocumentListItem[];
  limit: number;
  offset: number;
};

export type HealthDocumentListOptions = {
  limit?: number;
  offset?: number;
  status?: 'confirmed';
};

async function appendHealthDocumentFile(formData: FormData, file: SelectedHealthFile) {
  if (Platform.OS === 'web') {
    const blob = file.webFile ?? (await (await fetch(file.uri)).blob());
    formData.append('file', blob, file.name);
    return;
  }

  const nativeFile = new File(file.uri);
  formData.append('file', nativeFile, file.name);
}

export async function uploadHealthDocument(file: SelectedHealthFile) {
  const formData = new FormData();
  await appendHealthDocumentFile(formData, file);
  formData.append('original_file_name', file.name);

  return apiRequest<HealthDocumentResponse>('/api/health-documents', {
    body: formData,
    method: 'POST',
  });
}

export function getHealthDocument(uploadedFileId: string) {
  return apiRequest<HealthDocumentResponse>(
    `/api/health-documents/${encodeURIComponent(uploadedFileId)}`,
  );
}

export function getHealthDocuments({
  limit,
  offset,
  status,
}: HealthDocumentListOptions = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (limit !== undefined) params.set('limit', String(limit));
  if (offset !== undefined) params.set('offset', String(offset));
  const query = params.toString();

  return apiRequest<HealthDocumentListResponse>(
    `/api/health-documents${query ? `?${query}` : ''}`,
  );
}

/** Lists every matching health document so management totals never use a partial page count. */
export async function getAllHealthDocuments(
  options: Pick<HealthDocumentListOptions, 'status'> = {},
) {
  const limit = 100;
  let offset = 0;
  const items: HealthDocumentListItem[] = [];

  do {
    const page = await getHealthDocuments({ ...options, limit, offset });
    items.push(...page.items);
    if (!page.has_more) return items;
    offset += page.items.length;
    if (page.items.length === 0) return items;
  } while (true);
}

export function updateHealthDocumentOcrResult(
  uploadedFileId: string,
  request: OCRResultUpdateRequest,
) {
  return apiRequest<HealthDocumentResponse>(
    `/api/health-documents/${encodeURIComponent(uploadedFileId)}/ocr-result`,
    {
      body: JSON.stringify(request),
      method: 'PATCH',
    },
  );
}

export function confirmHealthDocument(uploadedFileId: string) {
  return apiRequest<HealthDocumentConfirmationResponse>(
    `/api/health-documents/${encodeURIComponent(uploadedFileId)}/confirm`,
    { method: 'POST' },
  );
}

export function getHealthDocumentErrorMessage(error: unknown) {
  if (!(error instanceof ApiError)) {
    return error instanceof Error
      ? error.message
      : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }

  switch (error.status) {
    case 0:
      return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
    case 401:
      return '로그인이 필요하거나 세션이 만료되었습니다.';
    case 404:
      return '업로드한 문서를 찾을 수 없습니다.';
    case 409:
      return 'OCR 결과가 아직 준비되지 않았거나 이미 확정된 문서입니다.';
    case 413:
      return '파일 크기는 10 MiB 이하만 업로드할 수 있습니다.';
    case 415:
      return 'PDF, PNG, JPEG, HEIC 파일만 업로드할 수 있습니다.';
    case 422:
      return '입력한 OCR 결과를 확인해 주세요.';
    case 502:
      return '문서 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.';
    default:
      return error.message;
  }
}
