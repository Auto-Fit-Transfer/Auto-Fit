import { Buffer } from 'node:buffer';

const required = [
  'EXPO_PUBLIC_API_BASE_URL',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
];

export function validatePreviewEnv(env) {
  const errors = [];
  for (const name of required) {
    const value = env[name]?.trim();
    if (!value || /YOUR_|REPLACE_ME/i.test(value)) errors.push(`${name} is missing.`);
  }
  for (const name of required.slice(0, 2)) {
    try {
      const url = new URL(env[name]);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(url.hostname)
      ) {
        errors.push(`${name} must be a public HTTPS URL.`);
      }
    } catch {
      errors.push(`${name} is not a valid URL.`);
    }
  }
  const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
  if (key.startsWith('sb_secret_')) errors.push('A server secret cannot be included in the app.');
  if (key.startsWith('eyJ')) {
    try {
      const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
      if (payload.role !== 'anon') errors.push('Only a publishable or legacy anon key is allowed.');
    } catch {
      errors.push('The legacy Supabase key is invalid.');
    }
  } else if (key && !key.startsWith('sb_publishable_')) {
    errors.push('Use a Supabase publishable key.');
  }
  return errors;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const errors = validatePreviewEnv(process.env);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Preview environment validated (values are not printed).');
  }
}
