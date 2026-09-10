/**
 * ESLint 9 flat configuration.
 *
 * `npm run lint` had been broken since the move to ESLint 9, which has no
 * `.eslintrc`; a lint that cannot run is a lint nobody is failing. This is
 * the recommended rule set for CommonJS on Node, with Jest globals in the
 * tests and the browser's in the shell. The architectural boundary — which
 * layer may require which — is enforced by tests/architecture.test.js rather
 * than a lint plugin, so it runs with the suite and needs nothing installed.
 */

'use strict';

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**', 'coverage/**', 'dist/**', 'playwright-report/**', 'test-results/**', 'ui/vendor/**', 'scratchpad/**', 'backups/**', '**/.*.js'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.es2021 },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-prototype-builtins': 'off',
      'no-useless-escape': 'off',
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
    /* Sweeps match source text verbatim, and source text has runs of spaces. */
    rules: { 'no-regex-spaces': 'off' },
  },
  {
    /* Browser tests: Node at the top level, the page's globals inside evaluate(). */
    files: ['e2e/**/*.js', 'playwright.config.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['ui/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser } },
    rules: { 'no-unused-vars': 'off', 'no-undef': 'off' },
  },
];
