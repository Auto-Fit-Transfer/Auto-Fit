// shortcut: this host is tied to a rented IP, move to a team-owned domain before the server is returned.
const API_HOSTS = ['211-233-206-193.sslip.io'];
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)$/;

// Every request carries the sign-in token and health data, so only known servers may receive them.
export function isAllowedApiOrigin(value: string, isDev: boolean) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return false;
  if (url.protocol === 'https:' && !url.port) return API_HOSTS.includes(url.hostname);
  return isDev && LOCAL_HOST.test(url.hostname);
}
