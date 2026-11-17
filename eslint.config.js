import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'fixtures/**',
      'coverage/**',
      'apps/beth-app/build/**',
      'apps/beth-app/.react-router/**',
      'apps/beth-app/public/**',
      '**/.shopify/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['scripts/**/*.ts', 'apps/beth-app/app/**/*.{ts,tsx}'],
    rules: { 'no-console': 'off' },
  },
  {
    // Theme app extension assets run in the shopper's browser as classic scripts.
    files: ['apps/beth-app/extensions/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        fetch: 'readonly',
        sessionStorage: 'readonly',
        DOMParser: 'readonly',
      },
    },
  },
);
