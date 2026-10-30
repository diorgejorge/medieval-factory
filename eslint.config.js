import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    // core/ é simulação pura: roda no Worker e não pode depender de render, UI ou input.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['**/render/**', '**/ui/**', '**/input/**', 'pixi.js'] },
      ],
    },
  },
);
