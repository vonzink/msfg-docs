'use strict';

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.es2022
      }
    },
    rules: {
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      'no-console': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }]
    }
  },
  {
    files: ['public/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.es2022,
        MSFG: 'writable',
        pdfMake: 'readonly'
      }
    },
    rules: {
      'no-redeclare': ['error', { builtinGlobals: false }]
    }
  },
  {
    ignores: [
      'node_modules/**',
      'public/**/*.min.js',
      'data/**',
      'public/documents/**'
    ]
  }
];
