import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
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
      indent: ['error', 2],
      quotes: ['error', 'single'],
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
      curly: ['error', 'multi-line'],
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
  }
);
