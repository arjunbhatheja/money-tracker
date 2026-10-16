import { createClient } from '@supabase/supabase-js';

let client;

// Server-only client. Uses the service role key, so never import this from a
// client component.
export function db() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set');
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

export function check({ data, error }) {
  if (error) throw new Error(`Database error: ${error.message}`);
  return data;
}
