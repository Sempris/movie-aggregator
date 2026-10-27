import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'apps/api/src/generated/**',
      'apps/web/playwright-report/**',
      'apps/web/test-results/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'] },
      globals: globals.browser,
    },
  },
  {
    files: ['apps/web/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['apps/api/**/*.ts', 'packages/**/*.ts', '**/*.config.{ts,mjs,js}'],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      // Single-word view names (HomeView excepted) read fine in this app.
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    // NestJS DI reads constructor parameter types at runtime; type-only imports would erase them.
    files: ['apps/api/src/**/*.ts'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
  prettier,
);
