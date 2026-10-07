// worker/auth.js — "Sign in with Google" without libraries. The page gets an ID token (a JWT signed by Google) from
// Google Identity Services; we check its RS256 signature against Google's published keys with WebCrypto, then hand out
// our own session cookie: `<payload>.<HMAC-SHA256>`, where payload = base64url JSON { u: user id, e: expiry (s) }.
const enc = new TextEncoder(), dec = new TextDecoder();
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
export const COOKIE = 'ct_sid';
export const SESSION_DAYS = 30;

export const b64u = {
  enc: bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: str => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)), c => c.charCodeAt(0)),
};
const json = part => JSON.parse(dec.decode(b64u.dec(part)));

// Google's signing keys, kept for as long as their Cache-Control allows
let certs = { keys: [], until: 0 };
export async function googleKeys(now = Date.now()) {
  if (now < certs.until) return certs.keys;
  const r = await fetch(CERTS);
  if (!r.ok) throw new Error('google certs ' + r.status);
  const age = +((r.headers.get('cache-control') || '').match(/max-age=(\d+)/) || [])[1] || 3600;
  certs = { keys: (await r.json()).keys, until: now + age * 1000 };
  return certs.keys;
}

// → the token's claims, or throws. getKeys is replaceable for tests.
export async function verifyGoogle(token, clientId, { getKeys = googleKeys, now = Date.now() } = {}) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const head = json(parts[0]), claims = json(parts[1]);
  if (head.alg !== 'RS256') throw new Error('unexpected alg');
  let jwk = (await getKeys(now)).find(k => k.kid === head.kid);
  if (!jwk && getKeys === googleKeys) { certs.until = 0; jwk = (await googleKeys(now)).find(k => k.kid === head.kid); }   // keys rotated
  if (!jwk) throw new Error('unknown key');
  const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u.dec(parts[2]), enc.encode(parts[0] + '.' + parts[1]));
  if (!ok) throw new Error('bad signature');
  const t = now / 1000;
  if (!ISSUERS.includes(claims.iss)) throw new Error('bad issuer');
  if (claims.aud !== clientId) throw new Error('bad audience');
  if (!(claims.exp > t - 60)) throw new Error('expired');
  if (claims.nbf && claims.nbf > t + 60) throw new Error('not yet valid');
  if (typeof claims.sub !== 'string' || !claims.sub) throw new Error('no subject');
  return claims;
}

const hmacKeys = new Map();
function hmac(secret) {
  if (!hmacKeys.has(secret)) hmacKeys.set(secret, crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']));
  return hmacKeys.get(secret);
}
export async function makeSession(secret, uid, now = Date.now()) {
  const body = b64u.enc(enc.encode(JSON.stringify({ u: uid, e: Math.floor(now / 1000) + SESSION_DAYS * 86400 })));
  return body + '.' + b64u.enc(await crypto.subtle.sign('HMAC', await hmac(secret), enc.encode(body)));
}
// → user id, or 0 when the cookie is missing, forged or expired
export async function readSession(secret, value, now = Date.now()) {
  const [body, sig] = String(value || '').split('.');
  if (!body || !sig) return 0;
  try {
    if (!await crypto.subtle.verify('HMAC', await hmac(secret), b64u.dec(sig), enc.encode(body))) return 0;
    const p = json(body);
    return Number.isInteger(p.u) && p.e > now / 1000 ? p.u : 0;
  } catch (e) { return 0; }
}
export function cookieOf(req, name = COOKIE) {
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}
export function setCookie(value, secure, maxAge = SESSION_DAYS * 86400) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
