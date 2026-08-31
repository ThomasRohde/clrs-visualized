// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

// https://astro.build/config
export default defineConfig({
  integrations: [mdx()],

  // ---------------------------------------------------------------------
  // Where this is served from.
  //
  // Both come from the environment rather than being hardcoded, because the
  // destination is a deployment decision and not a property of the source:
  //
  //   SITE_URL   the absolute origin, for canonical URLs and sitemaps
  //   BASE_PATH  the subpath, when the site is not served at the root
  //
  // `.github/workflows/deploy.yml` derives both from GITHUB_REPOSITORY for a
  // GitHub Pages project site. To serve at a domain root, set SITE_URL and
  // leave BASE_PATH unset.
  //
  // Every internal link in this project is built with the `href()` helper in
  // src/lib/paths.ts, which prefixes `import.meta.env.BASE_URL`, so nothing
  // else has to change. Check that claim rather than trusting it:
  //
  //   BASE_PATH=/clrs-visualized npm run build
  //
  // and every href in dist/ should carry the prefix.
  // ---------------------------------------------------------------------
  ...(process.env.SITE_URL ? { site: process.env.SITE_URL } : {}),
  ...(process.env.BASE_PATH ? { base: process.env.BASE_PATH } : {}),

  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      wrap: true,
    },
  },
});
