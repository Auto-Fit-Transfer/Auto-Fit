// Links from the server can come from AI output, so nothing but a web page may open another app.
export function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
