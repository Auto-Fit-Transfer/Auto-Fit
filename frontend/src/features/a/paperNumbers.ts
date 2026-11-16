import type { HealthDocumentListItem, HealthDocumentResponse } from '@/src/api/healthDocuments';

// Renewal A's 건강 서류 screen shows the three main numbers of the paper I gave last, one line per kind.
export interface PaperNumbers {
  kind: '인바디' | '건강검진';
  // The day on the paper (when it was measured), or the day it was given when the paper has none.
  day: string;
  items: { label: string; value: string; unit: string }[];
}

const text = (value: number | string | null | undefined) =>
  value === null || value === undefined ? '' : String(value);

function paperDay(value: string | null | undefined) {
  const found = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  return found ? `${Number(found[2])}월 ${Number(found[3])}일` : '';
}

function givenDay(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

export function paperNumbers(doc: HealthDocumentResponse): PaperNumbers {
  if (doc.document_type === 'body_composition') {
    const data = doc.extracted_data;
    return {
      kind: '인바디',
      day: paperDay(data.measured_at) || givenDay(doc.uploaded_at),
      items: [
        { label: '키', value: text(data.height_cm), unit: 'cm' },
        { label: '체중', value: text(data.weight_kg), unit: 'kg' },
        { label: '체지방률', value: text(data.body_fat_percentage), unit: '%' },
      ],
    };
  }
  const data = doc.extracted_data;
  const pressure =
    text(data.systolic_bp) && text(data.diastolic_bp) ? `${data.systolic_bp}/${data.diastolic_bp}` : '';
  return {
    kind: '건강검진',
    day: paperDay(data.checkup_date) || givenDay(doc.uploaded_at),
    items: [
      { label: '혈압', value: pressure, unit: '' },
      { label: '공복혈당', value: text(data.fasting_glucose), unit: 'mg/dL' },
      { label: '총콜레스테롤', value: text(data.total_cholesterol), unit: 'mg/dL' },
    ],
  };
}

// The paper given last of each kind (인바디 first), to ask the server for its numbers.
export function newestOfEachKind(items: HealthDocumentListItem[]) {
  const newest = (kind: HealthDocumentListItem['document_type']) =>
    items
      .filter((item) => item.document_type === kind)
      .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())[0];
  return [newest('body_composition'), newest('health_checkup')].filter((item) => item !== undefined);
}
