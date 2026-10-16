/**
 * An outbound HTTP(S) fetch for fetching user-supplied URLs server-side.
 *
 * The scraper fetches whatever URL a visitor types, which makes it a
 * server-side request forgery (SSRF) and resource-exhaustion surface. This
 * module is the single choke point that makes that safe enough to expose:
 *
 * - **Scheme / port / credentials**: only `http:` and `https:` on the default
 *   ports, and no `user:pass@` in the URL.
 * - **Private addresses**: loopback, RFC 1918, link-local (including the cloud
 *   metadata address `169.254.169.254`), CGNAT, multicast, reserved, and the
 *   IPv6 equivalents are refused. The check runs **inside the socket's DNS
 *   `lookup`**, i.e. on the exact address being connected to. Resolving first
 *   and fetching afterwards would be defeated by DNS rebinding (a hostname
 *   that resolves to a public address for the check and a private one for the
 *   connection). IP-literal hosts skip DNS, so they are checked up front.
 * - **Redirects** are followed manually, at most {@link DEFAULT_MAX_REDIRECTS},
 *   and every hop is re-validated by the same rules.
 * - **Limits**: an overall deadline (covering every hop and the body), a cap
 *   on the *decompressed* body size (so a small gzip bomb cannot expand past
 *   it), and an HTML/text content-type allow-list.
 *
 * Built on `http`/`https` rather than global `fetch`, because the latter
 * offers no supported way to hook DNS resolution without adding `undici`.
 */

import * as dns from "dns";
import * as http from "http";
import * as https from "https";
import { BlockList, isIP, type LookupFunction } from "net";
import type { Readable } from "stream";
import * as zlib from "zlib";

export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
export const DEFAULT_MAX_REDIRECTS = 3;

const ALLOWED_CONTENT_TYPES = new Set([
  "text/html",
  "application/xhtml+xml",
  "text/plain",
]);

const USER_AGENT = "MorcusNet/1.0 (+https://www.morcus.net)";

/** The URL or an address it resolved to is not allowed to be fetched. */
export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

/** The fetch ran into a limit: time, size, redirects, status, or type. */
export class FetchLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FetchLimitError";
  }
}

function buildDefaultBlockList(): BlockList {
  const list = new BlockList();
  const v4: [string, number][] = [
    ["0.0.0.0", 8], // "this network"
    ["10.0.0.0", 8], // RFC 1918
    ["100.64.0.0", 10], // CGNAT
    ["127.0.0.0", 8], // loopback
    ["169.254.0.0", 16], // link-local, incl. cloud metadata
    ["172.16.0.0", 12], // RFC 1918
    ["192.0.0.0", 24], // IETF protocol assignments
    ["192.0.2.0", 24], // TEST-NET-1
    ["192.88.99.0", 24], // 6to4 relay anycast
    ["192.168.0.0", 16], // RFC 1918
    ["198.18.0.0", 15], // benchmarking
    ["198.51.100.0", 24], // TEST-NET-2
    ["203.0.113.0", 24], // TEST-NET-3
    ["224.0.0.0", 4], // multicast
    ["240.0.0.0", 4], // reserved, incl. broadcast
  ];
  for (const [net, prefix] of v4) list.addSubnet(net, prefix, "ipv4");
  const v6: [string, number][] = [
    ["::", 128], // unspecified
    ["::1", 128], // loopback
    // Translated forms can smuggle an IPv4 address past a v4-only check.
    // Public sites are reachable over plain IPv4 or native IPv6, so these are
    // refused outright. IPv4-*mapped* addresses (`::ffff:a.b.c.d`) are not
    // listed here: Node's BlockList matches every IPv4 address against such a
    // rule, so `isBlockedAddress` unwraps them and checks the IPv4 instead.
    ["64:ff9b::", 96], // NAT64
    ["64:ff9b:1::", 48], // local-use NAT64
    ["2002::", 16], // 6to4 (embeds an IPv4 address)
    ["2001::", 32], // Teredo (embeds an IPv4 address)
    ["100::", 64], // discard-only
    ["2001:db8::", 32], // documentation
    ["fc00::", 7], // unique local
    ["fe80::", 10], // link-local
    ["ff00::", 8], // multicast
  ];
  for (const [net, prefix] of v6) list.addSubnet(net, prefix, "ipv6");
  return list;
}

/**
 * Which destinations may be fetched. Tests substitute a permissive policy to
 * talk to a local server; production code should always use the default.
 */
export interface AddressPolicy {
  blockList: BlockList;
  /** Allowed explicit ports (`""` is the scheme default), or null for any. */
  allowedPorts: ReadonlySet<string> | null;
}

export const DEFAULT_ADDRESS_POLICY: AddressPolicy = {
  blockList: buildDefaultBlockList(),
  allowedPorts: new Set(["", "80", "443"]),
};

/** Resolves a hostname to every address it maps to. */
export type Resolver = (
  hostname: string,
  options: dns.LookupOptions
) => Promise<dns.LookupAddress[]>;

const systemResolver: Resolver = (hostname, options) =>
  dns.promises.lookup(hostname, { ...options, all: true });

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  policy?: AddressPolicy;
  /** DNS resolver; defaults to the system resolver. Injectable for tests. */
  resolver?: Resolver;
}

export interface SafeFetchResult {
  text: string;
  /** The URL the body was actually served from, after redirects. */
  finalUrl: string;
  contentType: string;
}

/** Expands a valid IPv6 literal to its 8 hextets, e.g. `::1` → `[0,…,0,1]`. */
function ipv6Hextets(address: string): number[] {
  let text = address;
  // A trailing dotted quad (`::ffff:1.2.3.4`) stands for the last two hextets.
  const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (dotted !== null) {
    const [a, b, c, d] = dotted.slice(1).map(Number);
    const tail = `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(
      16
    )}`;
    text = text.slice(0, dotted.index) + tail;
  }
  const [head, rest] = text.split("::");
  const left = head ? head.split(":") : [];
  const right = rest ? rest.split(":") : [];
  const fill =
    rest === undefined ? [] : Array(8 - left.length - right.length).fill("0");
  return [...left, ...fill, ...right].map((h) => parseInt(h, 16));
}

/**
 * Returns the IPv4 address inside an IPv4-mapped IPv6 address
 * (`::ffff:127.0.0.1`, or `::ffff:7f00:1` as the URL parser writes it), or
 * null if `address` is not mapped. Assumes `address` is a valid IPv6 literal.
 */
function unmapIpv4(address: string): string | null {
  const h = ipv6Hextets(address);
  const isMapped = h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff;
  if (!isMapped) return null;
  return [h[6] >> 8, h[6] & 0xff, h[7] >> 8, h[7] & 0xff].join(".");
}

/** Whether `address` (an IP literal) is in the policy's block list. */
export function isBlockedAddress(
  address: string,
  policy: AddressPolicy = DEFAULT_ADDRESS_POLICY
): boolean {
  const family = isIP(address);
  if (family === 0) return true;
  if (family === 6) {
    const mapped = unmapIpv4(address);
    if (mapped !== null) return policy.blockList.check(mapped, "ipv4");
  }
  return policy.blockList.check(address, family === 4 ? "ipv4" : "ipv6");
}

/**
 * Prefixes `https://` to input with no scheme (`thelatinlibrary.com/x.html`),
 * as V1 did. Input that names any other scheme is left intact, so that it is
 * rejected by {@link validateFetchUrl} rather than reinterpreted as a host.
 */
export function withDefaultScheme(raw: string): string {
  const trimmed = raw.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
}

/**
 * Normalizes and validates a user-supplied URL before any network activity.
 * Bare hosts (`thelatinlibrary.com/cic.html`) get `https://`, as V1 did.
 */
export function validateFetchUrl(
  raw: string,
  policy: AddressPolicy = DEFAULT_ADDRESS_POLICY
): URL {
  let url: URL;
  try {
    url = new URL(withDefaultScheme(raw));
  } catch {
    throw new UnsafeUrlError(`Not a valid URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError(`Unsupported scheme: ${url.protocol}`);
  }
  if (url.username !== "" || url.password !== "") {
    throw new UnsafeUrlError("URLs with credentials are not allowed");
  }
  if (policy.allowedPorts !== null && !policy.allowedPorts.has(url.port)) {
    throw new UnsafeUrlError(`Port ${url.port} is not allowed`);
  }
  // WHATWG parsing already canonicalizes numeric IPv4 forms such as
  // `2130706433` or `0x7f.1` to dotted quads, so checking here is sufficient.
  const host = url.hostname.replace(/^\[(.*)\]$/, "$1");
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new UnsafeUrlError("Local addresses are not allowed");
  }
  if (isIP(host) !== 0 && isBlockedAddress(host, policy)) {
    throw new UnsafeUrlError("Private or reserved addresses are not allowed");
  }
  return url;
}

/**
 * A socket `lookup` that refuses to hand back blocked addresses. If *any*
 * address for the host is blocked, the whole lookup fails, rather than
 * quietly connecting to a public one: a host mixing both is suspicious. Handles
 * both the single-address and `all: true` call shapes; Node uses the latter
 * for happy-eyeballs connection attempts.
 */
function guardedLookup(
  policy: AddressPolicy,
  resolver: Resolver
): LookupFunction {
  return (hostname, options, callback) => {
    resolver(hostname, options).then(
      (addresses) => {
        const blocked = addresses.find((a) =>
          isBlockedAddress(a.address, policy)
        );
        if (addresses.length === 0 || blocked !== undefined) {
          const error: NodeJS.ErrnoException = new UnsafeUrlError(
            `${hostname} resolves to a private or reserved address`
          );
          error.code = "EUNSAFEADDR";
          callback(error, "", 0);
        } else if (options.all) {
          callback(null, addresses);
        } else {
          callback(null, addresses[0].address, addresses[0].family);
        }
      },
      (err: NodeJS.ErrnoException) => callback(err, "", 0)
    );
  };
}

function decodedBody(res: http.IncomingMessage): Readable {
  const encoding = (res.headers["content-encoding"] ?? "").toLowerCase();
  if (encoding === "gzip" || encoding === "x-gzip") {
    return res.pipe(zlib.createGunzip());
  }
  if (encoding === "deflate") return res.pipe(zlib.createInflate());
  if (encoding === "br") return res.pipe(zlib.createBrotliDecompress());
  return res;
}

function charsetOf(contentType: string): string {
  const match = /charset\s*=\s*"?([^";\s]+)/i.exec(contentType);
  return match ? match[1].toLowerCase() : "utf-8";
}

function decode(bytes: Buffer, contentType: string): string {
  try {
    return new TextDecoder(charsetOf(contentType)).decode(bytes);
  } catch {
    // Unknown label: fall back to what `fetch().text()` always did.
    return new TextDecoder("utf-8").decode(bytes);
  }
}

type HopResult =
  | { kind: "redirect"; location: string }
  | { kind: "body"; text: string; contentType: string };

interface HopOptions {
  maxBytes: number;
  policy: AddressPolicy;
  resolver: Resolver;
  signal: AbortSignal;
}

function fetchOnce(url: URL, options: HopOptions): Promise<HopResult> {
  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolvePromise, reject) => {
    const req = transport.request(
      url,
      {
        method: "GET",
        signal: options.signal,
        lookup: guardedLookup(options.policy, options.resolver),
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
        },
      },
      (res) => {
        // `pipe` does not forward source errors to the decompressor, so an
        // aborted or reset response must be surfaced from `res` itself.
        res.on("error", reject);
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          resolvePromise({ kind: "redirect", location: res.headers.location });
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          reject(new FetchLimitError(`Status ${status} on ${url.href}`));
          return;
        }
        const contentType = res.headers["content-type"] ?? "";
        const mediaType = contentType.split(";")[0].trim().toLowerCase();
        if (mediaType !== "" && !ALLOWED_CONTENT_TYPES.has(mediaType)) {
          res.resume();
          reject(new FetchLimitError(`Unsupported content type: ${mediaType}`));
          return;
        }
        const declared = Number(res.headers["content-length"]);
        if (Number.isFinite(declared) && declared > options.maxBytes) {
          res.destroy();
          reject(new FetchLimitError("Page is too large"));
          return;
        }

        const body = decodedBody(res);
        const chunks: Buffer[] = [];
        let size = 0;
        body.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > options.maxBytes) {
            res.destroy();
            body.destroy();
            reject(new FetchLimitError("Page is too large"));
            return;
          }
          chunks.push(chunk);
        });
        body.on("end", () =>
          resolvePromise({
            kind: "body",
            text: decode(Buffer.concat(chunks), contentType),
            contentType,
          })
        );
        body.on("error", reject);
      }
    );
    req.on("error", reject);
    req.end();
  });
}

/**
 * Fetches a user-supplied URL as text under the protections described in the
 * module comment. Rejects with {@link UnsafeUrlError} for disallowed
 * destinations and {@link FetchLimitError} when a limit is hit.
 */
export async function safeFetchText(
  rawUrl: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResult> {
  const policy = options.policy ?? DEFAULT_ADDRESS_POLICY;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  // One deadline for the whole operation, so a chain of slow redirects cannot
  // multiply it.
  const signal = AbortSignal.timeout(timeoutMs);
  const hopOptions: HopOptions = {
    maxBytes: options.maxBytes ?? DEFAULT_MAX_BYTES,
    policy,
    resolver: options.resolver ?? systemResolver,
    signal,
  };

  let url = validateFetchUrl(rawUrl, policy);
  for (let hop = 0; ; hop++) {
    let result: HopResult;
    try {
      result = await fetchOnce(url, hopOptions);
    } catch (err) {
      if (signal.aborted) {
        throw new FetchLimitError(`Timed out after ${timeoutMs}ms`);
      }
      throw err;
    }
    if (result.kind === "body") {
      return {
        text: result.text,
        finalUrl: url.href,
        contentType: result.contentType,
      };
    }
    if (hop >= maxRedirects) {
      throw new FetchLimitError("Too many redirects");
    }
    url = validateFetchUrl(new URL(result.location, url).href, policy);
  }
}
