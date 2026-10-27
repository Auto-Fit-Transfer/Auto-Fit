import { getSupabaseClient } from '@/src/lib/supabase';

const DEFAULT_API_BASE_URL = 'https://211-233-206-193.sslip.io';

// Keep endpoint paths (for example, `/api/profile`) unchanged while allowing
// each build environment to select its API server.
const configuredApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, '');

export const API_BASE_URL = configuredApiBaseUrl || DEFAULT_API_BASE_URL;

type ApiErrorBody = {
  code?: unknown;
  detail?: unknown;
  fields?: unknown;
  message?: unknown;
};

export class ApiError extends Error {
  code?: string;
  detail?: unknown;
  fields?: unknown[];
  responseBody?: unknown;
  status: number;

  constructor(status: number, message: string, body?: ApiErrorBody, responseBody?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = typeof body?.code === 'string' ? body.code : undefined;
    this.detail = body?.detail;
    this.fields = Array.isArray(body?.fields) ? body.fields : undefined;
    this.responseBody = responseBody;
  }
}

function findMessage(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value;
  if (Array.isArray(value)) {
    return value.map(findMessage).find((message) => Boolean(message));
  }
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return (
      findMessage(object.message) ??
      findMessage(object.msg) ??
      findMessage(object.detail) ??
      findMessage(object.error)
    );
  }
  return undefined;
}

export function getApiErrorMessage(error: unknown) {
  if (!(error instanceof ApiError)) {
    return error instanceof Error
      ? error.message
      : '요청을 처리하지 못했습니다. 다시 시도해 주세요.';
  }

  const serverMessage = findMessage(error.detail);
  if (serverMessage) return serverMessage;

  switch (error.status) {
    case 401:
      return '로그인이 만료되었습니다. 다시 로그인해 주세요.';
    case 404:
      return '채팅방을 찾지 못했습니다. 다시 열어 주세요.';
    case 409:
      return '이전 요청과 충돌했습니다. 같은 메시지로 다시 시도해 주세요.';
    case 422:
      return '메시지는 1~500자로 입력해 주세요.';
    case 502:
      return '건강 도우미 응답이 지연되고 있습니다. 잠시 후 다시 전송해 주세요.';
    default:
      return error.message;
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const finalUrl = `${API_BASE_URL}${path}`;

  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch (error) {
    throw new ApiError(401, error instanceof Error ? error.message : '로그인이 필요합니다.');
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new ApiError(401, '로그인이 필요합니다.');
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(finalUrl, { ...init, headers });
  } catch (error) {
    throw new ApiError(
      0,
      error instanceof Error ? error.message : '네트워크 연결을 확인해 주세요.',
    );
  }

  const payload = await readJson(response);
  if (!response.ok) {
    const body = payload && typeof payload === 'object' ? (payload as ApiErrorBody) : undefined;
    throw new ApiError(
      response.status,
      findMessage(body?.detail) ?? findMessage(payload) ?? `HTTP ${response.status}`,
      body,
      payload,
    );
  }

  return payload as T;
}
