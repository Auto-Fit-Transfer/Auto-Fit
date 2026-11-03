import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

if (process.env.EAS_BUILD_PLATFORM === 'ios') {
  const require = createRequire(import.meta.url);
  const expoRoot = dirname(require.resolve('expo/package.json'));
  const coreRoot = dirname(require.resolve('expo-modules-core/package.json', {
    paths: [expoRoot],
  }));
  const target = join(coreRoot, 'ios/Core/Functions/AsyncFunctionDefinition.swift');
  const source = readFileSync(target, 'utf8');
  const crashingPattern = 'case .failure(let error as any Error):';
  const compatiblePattern = 'case .failure(let error):';
  const occurrences = source.split(crashingPattern).length - 1;

  if (occurrences === 1) {
    writeFileSync(target, source.replace(crashingPattern, compatiblePattern));
    console.log('Applied Swift compiler workaround to ExpoModulesCore.');
  } else if (occurrences === 0 && source.includes(compatiblePattern)) {
    console.log('ExpoModulesCore already has the compatible Swift pattern.');
  } else {
    throw new Error('Unexpected ExpoModulesCore Swift source; build stopped.');
  }
}
