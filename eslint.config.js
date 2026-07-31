import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const configDirectory = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  // デモ用の TypeScript ファイルは対象外（HTMLのみのデモを想定）
  {ignores: ['demo/**']},
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: configDirectory,
      },
      globals: {
        document: 'readonly',
        window: 'readonly',
        HTMLScriptElement: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      // Google TypeScript Style Guide rules
      'max-len': ['error', {code: 80}],
      // インデントは Prettier（`npm run format`）が決める。三項演算子やメソッド
      // チェーンの折り返しで indent ルールと結論が異なり、両方を満たせないため
      // ここでは検査しない（幅は max-len で担保する）。
      indent: 'off',
      // 文字列にシングルクォートが含まれる場合はダブルクォートを許す。
      // エスケープを避ける書き方は Google style でも認められており、Prettier も
      // エスケープが減る側のクォートを選ぶ。
      quotes: ['error', 'single', {avoidEscape: true}],
      semi: ['error', 'always'],
      'comma-dangle': ['error', 'only-multiline'],
      'object-curly-spacing': ['error', 'never'],
      'array-bracket-spacing': ['error', 'never'],
      'space-before-function-paren': [
        'error',
        {anonymous: 'never', named: 'never', asyncArrow: 'always'},
      ],
      'keyword-spacing': ['error'],
      'space-infix-ops': ['error'],
      'eol-last': ['error'],
      'no-trailing-spaces': ['error'],
      'brace-style': ['error', '1tbs'],
      curly: ['error', 'all'],
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-arrow-callback': 'error',
      'arrow-parens': ['error', 'as-needed'],

      // TypeScript specific
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_'}],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/prefer-readonly': 'error',
    },
  },
  // テストファイルは長い HTML テンプレートや多様な any の使用を許容するため一部ルールを緩和
  {
    files: ['tests/**'],
    rules: {
      'max-len': ['error', {code: 120}],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
