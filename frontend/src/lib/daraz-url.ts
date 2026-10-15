/**
 * Instant client-side check of a Daraz.pk product URL. Mirrors
 * backend/app/core/url_validator.py, which stays authoritative (CLAUDE.md §6.2).
 */

const ALLOWED_HOSTS = new Set(["daraz.pk", "www.daraz.pk", "m.daraz.pk"]);
// The slug can be empty: Daraz also serves links like /products/-i574837330-s2655076903.html.
const PRODUCT_PATH = /^\/products\/[\w-]*-i\d+(?:-s\d+)?\.html$/;

export type UrlCheck = { ok: true; url: string } | { ok: false; message: string };

export function checkDarazUrl(input: string): UrlCheck {
  const raw = input.trim();
  if (!raw) return { ok: false, message: "Paste a Daraz.pk product link." };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, message: "That doesn't look like a web address." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, message: "The link must start with https://." };
  }
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    return { ok: false, message: "Only daraz.pk product pages are supported." };
  }
  if (!PRODUCT_PATH.test(url.pathname)) {
    return { ok: false, message: "That's a Daraz page, but not a product page (…-i<number>.html)." };
  }
  return { ok: true, url: `${url.origin}${url.pathname}` };
}
