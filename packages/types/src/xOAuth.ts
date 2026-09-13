import { createHmac, randomBytes } from "node:crypto";

/**
 * X OAuth 1.0a — "Sign in with X".
 *
 * ## Why this exists alongside the OAuth 2.0 code
 *
 * OAuth 2.0 works on any tier, but it hands back a bare access token with no
 * identity in it: X issues no OpenID Connect `id_token`, so the only way to learn
 * who signed in is `GET /2/users/me` — a **v2** endpoint, which a deprecated Free
 * tier refuses with `client-not-enrolled`. That is the wall this route goes round.
 *
 * ## The part that makes this actually free
 *
 * OAuth 1.0a's `access_token` response is not just a credential. X returns:
 *
 *     oauth_token=…&oauth_token_secret=…&user_id=123&screen_name=jack
 *
 * `user_id` and `screen_name` come back **from the OAuth endpoint itself**, so the
 * identity we need arrives with no API call at all — nothing to be tier-gated.
 * That is the whole reason this is worth the rewrite.
 *
 * The avatar is the one thing still behind an API (`verify_credentials`, v1.1), so
 * it is fetched separately and allowed to fail: a missing avatar is a placeholder
 * circle, while a missing handle would be no signup at all.
 */

export const REQUEST_TOKEN_URL = "https://api.x.com/oauth/request_token";
/** `authenticate`, not `authorize`: it skips the prompt for a user who has already
 * approved the app, which is the behaviour people expect from a sign-in button. */
export const AUTHENTICATE_URL = "https://api.x.com/oauth/authenticate";
export const ACCESS_TOKEN_URL = "https://api.x.com/oauth/access_token";
export const VERIFY_CREDENTIALS_URL =
  "https://api.x.com/1.1/account/verify_credentials.json?skip_status=true&include_email=false";

/**
 * RFC 3986 percent-encoding, which is NOT what `encodeURIComponent` does.
 *
 * It leaves `!*'()` alone; OAuth requires them encoded. Every one of those
 * characters appears in real handles and callback URLs, and a single mismatch
 * makes the signature wrong — with X answering a bare 401 that names nothing.
 * Unreserved set is exactly ALPHA / DIGIT / "-" / "." / "_" / "~".
 */
export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!*'()]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * The signature base string: METHOD&url&params, each percent-encoded once.
 *
 * Parameters are sorted by encoded key, then by encoded value — sorting the raw
 * strings gives a different order whenever encoding changes their relative order,
 * and the failure is again an unexplained 401.
 */
export function signatureBaseString(
  method: string,
  url: string,
  params: Record<string, string>,
): string {
  const normalized = Object.entries(params)
    .map(([k, v]) => [percentEncode(k), percentEncode(v)] as const)
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  return [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(normalized),
  ].join("&");
}

/** HMAC-SHA1 over the base string, keyed by `consumerSecret&tokenSecret`. The
 * trailing `&` is required even when there is no token secret yet. */
export function sign(
  base: string,
  consumerSecret: string,
  tokenSecret = "",
): string {
  const key = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  return createHmac("sha1", key).update(base).digest("base64");
}

export interface OAuth1Credentials {
  consumerKey: string;
  consumerSecret: string;
  /** Present once the user has a token; absent for the request-token call. */
  token?: string;
  tokenSecret?: string;
}

/**
 * Builds the `Authorization: OAuth …` header for one request.
 *
 * `extraParams` are protocol parameters that participate in the signature —
 * `oauth_callback` on the request-token call, `oauth_verifier` on the access-token
 * call. Query parameters already in `url` are folded in too, because the spec
 * signs them and omitting them is the third way to earn a silent 401.
 */
export function authHeader(
  method: string,
  url: string,
  creds: OAuth1Credentials,
  extraParams: Record<string, string> = {},
  nonce = randomBytes(16).toString("hex"),
  timestamp = Math.floor(Date.now() / 1000).toString(),
): string {
  const parsed = new URL(url);
  const queryParams: Record<string, string> = {};
  parsed.searchParams.forEach((v, k) => {
    queryParams[k] = v;
  });
  // The base string uses the URL without its query.
  const baseUrl = `${parsed.origin}${parsed.pathname}`;

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_version: "1.0",
    ...(creds.token ? { oauth_token: creds.token } : {}),
    ...extraParams,
  };

  const signature = sign(
    signatureBaseString(method, baseUrl, { ...queryParams, ...oauthParams }),
    creds.consumerSecret,
    creds.tokenSecret ?? "",
  );

  // Only oauth_* parameters go in the header -- query parameters were signed but
  // are not repeated here.
  const headerParams = { ...oauthParams, oauth_signature: signature };
  return (
    "OAuth " +
    Object.entries(headerParams)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
      .join(", ")
  );
}

/** X answers these endpoints with a form-encoded body, not JSON. */
export function parseFormBody(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(body)) out[k] = v;
  return out;
}

export interface AccessTokenResult {
  oauthToken: string;
  oauthTokenSecret: string;
  /** From the OAuth response itself — no API call, so no tier gate. */
  userId: string;
  screenName: string;
}

/** Reads the access-token response, which carries the identity. */
export function readAccessToken(body: string): AccessTokenResult | null {
  const p = parseFormBody(body);
  if (!p.oauth_token || !p.oauth_token_secret || !p.user_id || !p.screen_name) {
    return null;
  }
  return {
    oauthToken: p.oauth_token,
    oauthTokenSecret: p.oauth_token_secret,
    userId: p.user_id,
    screenName: p.screen_name,
  };
}

/** X returns a 73px avatar by default; `_normal` → `_400x400` is the documented
 * way to ask for the large one. Returns null rather than guessing a URL. */
export function largeAvatar(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.replace("_normal.", "_400x400.");
}
