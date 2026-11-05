// Errors can carry server responses with health data, so only the kind of failure is logged, and only in development.
export function logError(label: string, error: unknown) {
  if (!__DEV__) return;
  const status = (error as { status?: unknown } | null)?.status;
  console.warn(label, typeof status === 'number' ? status : error instanceof Error ? error.name : 'unknown');
}
