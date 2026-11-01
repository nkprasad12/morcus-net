/**
 * Byte decoding for raw Latin Library HTML pages.
 *
 * Browser-safe: uses only the WHATWG `TextDecoder` (available in browsers and
 * in Node >= 11 as a global). Must not import `fs`, `path`, `crypto`, `node:*`
 * or `parse5`.
 */

/** How many leading bytes are sniffed for a `<meta charset>` declaration. */
const SNIFF_BYTES = 1024;

/**
 * Charset labels that mean "single-byte Western" on the web. Per the WHATWG
 * Encoding Standard, `iso-8859-1`, `latin1`, `us-ascii` etc. are all decoded as
 * `windows-1252`, which is a superset of ISO-8859-1's printable range.
 */
const WINDOWS_1252_LABELS = new Set([
  "iso-8859-1",
  "iso8859-1",
  "iso_8859-1",
  "iso-ir-100",
  "latin1",
  "l1",
  "cp1252",
  "windows-1252",
  "x-cp1252",
  "cp819",
  "ibm819",
  "csisolatin1",
]);

function toUint8Array(bytes: ArrayBuffer | Uint8Array): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

/**
 * Returns the lowercased charset declared by a `<meta charset=...>` or
 * `<meta http-equiv="Content-Type" content="...; charset=...">` tag in the
 * first 1,024 bytes, or `undefined` if none is declared.
 */
export function sniffDeclaredCharset(
  bytes: ArrayBuffer | Uint8Array
): string | undefined {
  const view = toUint8Array(bytes);
  const n = Math.min(view.length, SNIFF_BYTES);
  // Only ASCII matters for the sniff; map every byte to one UTF-16 unit.
  let head = "";
  for (let i = 0; i < n; i++) {
    head += String.fromCharCode(view[i]);
  }
  const metaTags = head.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metaTags) {
    const m = /charset\s*=\s*["']?\s*([A-Za-z0-9_.:-]+)/i.exec(tag);
    if (m !== null) return m[1].toLowerCase();
  }
  return undefined;
}

function decodeWindows1252(view: Uint8Array): string {
  return new TextDecoder("windows-1252").decode(view);
}

/**
 * Decodes the raw bytes of a Latin Library HTML page into a string.
 *
 * - If the first 1,024 bytes declare an ISO-8859-1 / windows-1252 charset
 *   (`<meta ... charset=...>`), the bytes are decoded as `windows-1252`.
 * - Otherwise the bytes are decoded as strict UTF-8, falling back to
 *   `windows-1252` if they are not valid UTF-8 (e.g. `raw/gaius1.html`,
 *   which declares nothing and is Latin-1 encoded).
 *
 * A leading UTF-8 byte-order mark is dropped. Never throws.
 */
export function decodeLatinLibraryHtmlBytes(
  bytes: ArrayBuffer | Uint8Array
): string {
  const view = toUint8Array(bytes);
  const declared = sniffDeclaredCharset(view);
  if (declared !== undefined && WINDOWS_1252_LABELS.has(declared)) {
    return decodeWindows1252(view);
  }
  try {
    // `ignoreBOM: false` (the default) strips a leading UTF-8 BOM.
    return new TextDecoder("utf-8", { fatal: true }).decode(view);
  } catch {
    return decodeWindows1252(view);
  }
}
