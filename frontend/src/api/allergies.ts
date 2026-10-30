import { apiRequest } from '@/src/api/client';

export type AllergyType = {
  allergy_type_id: string;
  name: string;
  description: string | null;
};

export type UserAllergy = {
  user_allergy_id: string;
  allergy_type_id: string | null;
  custom_name: string | null;
  created_at: string;
};

export type AllergiesResponse = {
  catalog: AllergyType[];
  selected: UserAllergy[];
};

export function getAllergies() {
  return apiRequest<AllergiesResponse>('/api/allergies', { method: 'GET' });
}

export function saveAllergySelection(allergyTypeIds: string[], customNames: string[]) {
  return apiRequest<{ ok: boolean; selected: UserAllergy[] }>('/api/allergies', {
    method: 'PUT',
    body: JSON.stringify({ allergy_type_ids: allergyTypeIds, custom_names: customNames }),
  });
}
