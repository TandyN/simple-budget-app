import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dev-dist/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'blob-report/**',
      'node_modules/**',
      'eslint.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  jsxA11y.flatConfigs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },
  {
    files: ['e2e/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              message: 'src/domain/ must stay pure and cannot import React.',
            },
            {
              name: 'react-dom',
              message: 'src/domain/ must stay pure and cannot import React DOM.',
            },
            {
              name: 'dexie',
              message: 'src/domain/ must stay pure and cannot import Dexie.',
            },
            {
              name: 'dexie-react-hooks',
              message: 'src/domain/ must stay pure and cannot import Dexie hooks.',
            },
          ],
          patterns: [
            {
              group: [
                '@/data/*',
                '@/app/*',
                '@/ui/*',
                '@/pwa/*',
                '../data/*',
                '../app/*',
                '../ui/*',
                '../pwa/*',
              ],
              message:
                'src/domain/ must stay pure and cannot import from data, app, ui, or pwa layers.',
            },
          ],
        },
      ],
    },
  },
  eslintConfigPrettier,
);
