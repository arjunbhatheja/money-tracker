// Minimal Plaid REST client (no SDK). Docs: https://plaid.com/docs/api/

const HOSTS = {
  sandbox: 'https://sandbox.plaid.com',
  production: 'https://production.plaid.com',
};

export async function plaid(path, body = {}) {
  const env = process.env.PLAID_ENV || 'sandbox';
  const host = HOSTS[env];
  if (!host) throw new Error(`Unknown PLAID_ENV "${env}"`);
  const res = await fetch(`${host}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      ...body,
    }),
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error_message || `Plaid ${path} failed (${res.status})`);
    err.code = json.error_code;
    err.type = json.error_type;
    throw err;
  }
  return json;
}

export function appUrl() {
  return (process.env.APP_URL || '').replace(/\/$/, '');
}

export async function createLinkToken() {
  const body = {
    client_name: 'Money Tracker',
    user: { client_user_id: 'owner' },
    products: ['transactions'],
    transactions: { days_requested: 730 },
    country_codes: ['US'],
    language: 'en',
  };
  if (appUrl()) body.webhook = `${appUrl()}/api/plaid/webhook`;
  if (process.env.PLAID_REDIRECT_URI) body.redirect_uri = process.env.PLAID_REDIRECT_URI;
  const { link_token } = await plaid('/link/token/create', body);
  return link_token;
}
