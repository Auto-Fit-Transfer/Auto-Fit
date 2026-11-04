import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

// Xcode 27.2's Swift compiler crashes while lowering the typed error pattern
// inside a consuming switch in expo-modules-core 58.0.26. The error is already
// an Exception, which conforms to Error, so the cast is unnecessary.
const require = createRequire(import.meta.url);
const expoRoot = join(require.resolve('expo/package.json'), '..');
const source = join(
  expoRoot,
  'node_modules/expo-modules-core/ios/Core/Functions/AsyncFunctionDefinition.swift',
);
const original = readFileSync(source, 'utf8');
const crashing = 'case .failure(let error as any Error):';
const replacement = 'case .failure(let error):';

if (original.includes(crashing)) {
  writeFileSync(source, original.replace(crashing, replacement));
  console.log('Patched expo-modules-core for Xcode 27.2 Swift compiler.');
} else if (!original.includes(replacement)) {
  throw new Error('Expo Swift compiler patch target changed; review dependency before building.');
}
