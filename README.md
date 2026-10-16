# Money Tracker

A personal budget tracker: Plaid pulls balances and transactions from your banks into Supabase, the dashboard shows what's safe to spend this month against your plan, and a small MCP endpoint lets Claude answer "can I afford this?" in chat.

**Stack:** Next.js on Vercel · Supabase (Postgres) · Plaid REST API · Vercel Cron (daily sync)

## How it works

- **Connect a bank** opens Plaid Link. The access token is encrypted (AES-256-GCM) and stored in Supabase; it never reaches the browser.
- **Sync** uses `/transactions/sync` with a stored cursor, so each sync only fetches changes. It runs on connect, on Plaid webhooks, daily at 6 AM Central via cron, and from the Sync button.
- **Buckets:** each transaction is sorted into food, yourself, bills, India (Wise/Remitly etc.), or savings (transfers out). Income, transfers in, and credit card payments aren't counted as spending.
- **Safe to spend** = (food + yourself budgets) − what's been spent in those buckets this month.
- The plan (income, bills, budgets) lives in `lib/budget.js`.

## Setup

### 1. Supabase
Create a project in **your own** organization, then run `supabase/migrations/0001_init.sql` in the SQL editor. Copy the project URL and **service role** key (Settings → API).

### 2. Vercel environment variables
Add every variable in `.env.example`. Generate the random ones with `openssl rand -base64 32`. Start with `PLAID_ENV=sandbox` and the Sandbox secret.

### 3. Plaid
- Developers → Webhooks isn't required: the webhook URL is sent automatically from `APP_URL`.
- For Chase, BofA, Capital One etc. (OAuth banks), add `https://<your-app>.vercel.app/oauth` under **Allowed redirect URIs**, then set `PLAID_REDIRECT_URI` to the same value.

### 4. Try it in Sandbox
Sign in, click **Connect a bank**, pick any bank, and log in with `user_good` / `pass_good`. Sandbox items don't count toward the 10-item Trial limit.

### 5. Connect Claude
In Claude, go to **Settings → Connectors → Add custom connector** and use:

```
https://<your-app>.vercel.app/api/mcp/<MCP_SECRET>
```

Treat that URL like a password. Tools: `get_balances`, `get_transactions`, `spending_summary`, `can_i_afford`, `get_plan`, `sync_now`.

### 6. Go live
Choose the **Trial** plan in Plaid onboarding, then switch `PLAID_SECRET` to the Production secret and `PLAID_ENV=production`. Sandbox connections won't work in Production, so delete those rows from `items` first. Link each real bank once: every bank login uses one of the 10 Trial items, for good.

## Security notes
- Single user: one password, signed 30-day cookie.
- Supabase tables have RLS enabled with no policies, so only the server (service role) can read them.
- Plaid webhook signatures aren't verified yet. A forged webhook can only trigger a sync of an existing bank, but verify `Plaid-Verification` before letting anyone else use this.
