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
      /* `varsIgnorePattern: '^_'` is gone. It hid every unused private —
         exactly the names most likely to be left behind by a refactor, and the
         ones a reader most needs to trust are still used. Arguments keep the
         escape, because a middleware signature is fixed by Express. */
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-prototype-builtins': 'off',
      'no-useless-escape': 'off',

      /* Every file is strict. 63 were not, and in a non-strict module a typo
         in an assignment creates a global instead of throwing — the failure
         mode that is hardest to see and easiest to ship. */
      strict: ['error', 'global'],

      /* Equality, shadowing and the things that read as one thing and mean
         another. These are all zero-violation today; the rule is what keeps
         them there. */
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
      'no-throw-literal': 'error',
      'no-return-await': 'error',
      'no-console': 'off',        // tests/observability.test.js is stricter than a lint can be

      /* One documented invariant a lint can actually see. The rest are domain
         rules and are held by tests, which can read the code's meaning. */
      'no-restricted-properties': ['error',
        {
          object: 'process',
          property: 'env',
          message: 'Read the environment through src/platform/config — one place reads it, and tests/config.test.js asserts that. (Config, the scripts and the tests are exempt.)',
        },
      ],
    },
  },
  {
    /* The four places that legitimately read the environment: config itself,
       the composition roots' bootstrap, the CLI scripts, and the suite. */
    files: ['src/platform/config/**/*.js', 'scripts/**/*.js', 'tests/**/*.js', 'e2e/**/*.js', 'netlify/functions/**/*.js', 'playwright.config.js', 'jest.config.js'],
    rules: { 'no-restricted-properties': 'off' },
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
    /* A page module is a classic script wrapped in an IIFE. A global directive
       there would apply to whatever else the page loaded, and requiring the
       function form means one in every nested function — 87 of them. The
       browser files are a known gap rather than a silent one; what the server
       needed strict mode for (a typo creating a global) is caught in `ui/` by
       the build and by `npm run typecheck`, which covers `ui/js` on its own
       configuration. */
    rules: { 'no-unused-vars': 'off', 'no-undef': 'off', strict: 'off' },
  },
];
