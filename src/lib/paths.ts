/**
 * Build internal URLs that survive being deployed under a base path.
 *
 * Astro exposes the configured `base` as import.meta.env.BASE_URL. Using this
 * helper everywhere means switching between a root deploy and a GitHub Pages
 * project subpath is a one-line change in astro.config.mjs.
 */
const BASE = import.meta.env.BASE_URL;

export function href(path = '/'): string {
  const base = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE;
  const rest = path.startsWith('/') ? path : `/${path}`;
  const joined = `${base}${rest}`;
  return joined === '' ? '/' : joined;
}

export function chapterHref(slug: string): string {
  return href(`/chapters/${slug}/`);
}
