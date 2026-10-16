// Signed session cookie using Web Crypto, so it works both in middleware
// (Edge runtime) and in Node route handlers.

export const SESSION_COOKIE = 'mt_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

const enc = new TextEncoder();

async function hmac(data) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken() {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  return `${exp}.${await hmac(String(exp))}`;
}

export async function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig) return false;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  try {
    return safeEqual(sig, await hmac(exp));
  } catch {
    return false;
  }
}

export { MAX_AGE_SECONDS, safeEqual };
