const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: ['.expo/**', 'dist/**', 'node_modules/**'],
  },
  {
    // The shared Text keeps Korean words whole when a line wraps.
    files: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    ignores: ['src/components/common/Text.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: ['Text'],
              message: "Use Text from '@/src/components/common' so Korean wraps between words.",
            },
          ],
        },
      ],
    },
  },
]);
