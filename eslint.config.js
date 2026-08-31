// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  eslintConfigPrettier,
  {
    ignores: ['dist/', '.astro/', 'node_modules/'],
  },
  {
    // The Astro config runs in Node and reads the deployment target from the
    // environment, so `process` is in scope here and nowhere else in src/.
    files: ['*.config.{js,mjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    // Build/verification scripts run in Node, but the bodies they hand to
    // Playwright's page.evaluate() run in the browser — so both sets of
    // globals are legitimately in scope in one file.
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
);
