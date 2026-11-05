import type {
  BodyCompositionDocumentResponse,
  BodyCompositionExtractedData,
  HealthCheckupDocumentResponse,
  HealthCheckupExtractedData,
  HealthDocumentOcrStatus,
  HealthDocumentResponse,
  HealthDocumentStatus,
  HealthDocumentType,
} from '@/src/api/healthDocuments';

import type { SelectedHealthFile } from './useHealthFilePicker';

export type OCRDocumentType = HealthDocumentType;

export type HealthCheckupOCRResult = {
  hdlCholesterol: string;
  ldlCholesterol: string;
  triglycerides: string;
  ast: string;
  alt: string;
  gammaGtp: string;
  creatinine: string;
  bloodPressure: string;
  bmi: string;
  checkupDate: string;
  fastingBloodSugar: string;
  height: string;
  hemoglobin: string;
  totalCholesterol: string;
  weight: string;
};

export type InbodyOCRResult = {
  basalMetabolicRate: string;
  bmi: string;
  bodyFatMass: string;
  bodyFatPercentage: string;
  height: string;
  measurementDate: string;
  skeletalMuscleMass: string;
  visceralFatLevel: string;
  weight: string;
};

type OCRResultBase = {
  fileMimeType?: string;
  fileName: string;
  fileSource: SelectedHealthFile['source'];
  id: string;
  ocrStatus: HealthDocumentOcrStatus;
  previewUri?: string;
  status: HealthDocumentStatus;
  uploadedAt: string;
  uploadedFileId: string;
};

export type OCRResultItem =
  | (OCRResultBase & {
      apiData: HealthCheckupExtractedData;
      data: HealthCheckupOCRResult;
      type: 'health_checkup';
    })
  | (OCRResultBase & {
      apiData: BodyCompositionExtractedData;
      data: InbodyOCRResult;
      type: 'body_composition';
    });

function displayValue(value: number | string | null | undefined) {
  return value === null || value === undefined ? '' : String(value);
}

function displayDate(value: string | null | undefined) {
  if (!value) return '';
  return value.slice(0, 10).replaceAll('-', '.');
}

function mapHealthCheckupData(data: HealthCheckupExtractedData): HealthCheckupOCRResult {
  const systolic = displayValue(data.systolic_bp);
  const diastolic = displayValue(data.diastolic_bp);

  return {
    hdlCholesterol: displayValue(data.hdl_cholesterol),
    ldlCholesterol: displayValue(data.ldl_cholesterol),
    triglycerides: displayValue(data.triglycerides),
    ast: displayValue(data.ast),
    alt: displayValue(data.alt),
    gammaGtp: displayValue(data.gamma_gtp),
    creatinine: displayValue(data.creatinine),
    bloodPressure: systolic && diastolic ? `${systolic} / ${diastolic}` : '',
    bmi: displayValue(data.bmi),
    checkupDate: displayDate(data.checkup_date),
    fastingBloodSugar: displayValue(data.fasting_glucose),
    height: displayValue(data.height_cm),
    hemoglobin: displayValue(data.hemoglobin),
    totalCholesterol: displayValue(data.total_cholesterol),
    weight: displayValue(data.weight_kg),
  };
}

function mapBodyCompositionData(data: BodyCompositionExtractedData): InbodyOCRResult {
  return {
    basalMetabolicRate: displayValue(data.basal_metabolic_rate),
    bmi: displayValue(data.bmi),
    bodyFatMass: displayValue(data.body_fat_mass_kg),
    bodyFatPercentage: displayValue(data.body_fat_percentage),
    height: displayValue(data.height_cm),
    measurementDate: displayDate(data.measured_at),
    skeletalMuscleMass: displayValue(data.skeletal_muscle_mass_kg),
    visceralFatLevel: displayValue(data.visceral_fat_level),
    weight: displayValue(data.weight_kg),
  };
}

function baseResult(response: HealthDocumentResponse, file: SelectedHealthFile): OCRResultBase {
  return {
    fileMimeType: file.mimeType,
    fileName: response.original_file_name?.trim() || response.file_name,
    fileSource: file.source,
    id: response.uploaded_file_id,
    ocrStatus: response.ocr_status,
    previewUri: file.uri,
    status: response.status,
    uploadedAt: response.uploaded_at,
    uploadedFileId: response.uploaded_file_id,
  };
}

export function mapHealthDocumentToOCRResult(
  response: HealthCheckupDocumentResponse,
  file: SelectedHealthFile,
): OCRResultItem;
export function mapHealthDocumentToOCRResult(
  response: BodyCompositionDocumentResponse,
  file: SelectedHealthFile,
): OCRResultItem;
export function mapHealthDocumentToOCRResult(
  response: HealthDocumentResponse,
  file: SelectedHealthFile,
): OCRResultItem;
export function mapHealthDocumentToOCRResult(
  response: HealthDocumentResponse,
  file: SelectedHealthFile,
): OCRResultItem {
  const common = baseResult(response, file);

  if (response.document_type === 'health_checkup') {
    return {
      ...common,
      apiData: response.extracted_data,
      data: mapHealthCheckupData(response.extracted_data),
      type: 'health_checkup',
    };
  }

  return {
    ...common,
    apiData: response.extracted_data,
    data: mapBodyCompositionData(response.extracted_data),
    type: 'body_composition',
  };
}
