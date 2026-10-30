import { apiRequest } from '@/src/api/client';

export type BodyMeasurement = {
  body_composition_id: string;
  measured_at: string;
  weight_kg: string | number | null;
  skeletal_muscle_mass_kg: string | number | null;
  body_fat_percentage: string | number | null;
  bmi: string | number | null;
};

export type CheckupMeasurement = {
  health_checkup_id: string;
  checkup_date: string;
  weight_kg: string | number | null;
  bmi: string | number | null;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  fasting_glucose: string | number | null;
  total_cholesterol: string | number | null;
};

export type HealthReport = {
  period_start: string;
  target_weight_kg: string | number | null;
  body_compositions: BodyMeasurement[];
  health_checkups: CheckupMeasurement[];
};

export function getHealthReport() {
  return apiRequest<HealthReport>('/api/health-report', { method: 'GET' });
}
