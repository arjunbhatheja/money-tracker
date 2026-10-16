import { NextResponse } from 'next/server';
import { safeEqual } from './session';
import {
  getAccounts, cashPosition, periodSummary, canIAfford, PLAN, fixedTotal, BUCKETS, BUCKET_KEYS,
  loadContext, classify, needsReview, reviewQueue, categorize, addRule,
} from './budget';
import { db, check } from './db';
import { syncAll } from './sync';


// A small MCP server (Streamable HTTP, JSON responses, stateless) so Claude can
// read this app's data. Auth is a shared secret (MCP_SECRET) sent either in
// the URL path or as an X-MCP-Secret header. Treat it like a password.

const SERVER_INFO = { name: 'money-tracker', version: '0.2.0' };

const TOOLS = [
  {
    name: 'get_balances',
    description: 'Current balances for every linked account, plus totals: cash in checking/savings, credit card debt, cash minus card debt, and investments.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_transactions',
    description: 'Recent transactions, newest first. Amounts are positive for money out and negative for money in. Each row includes its budget bucket.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'integer', description: 'How many days back (default 30, max 730)' },
        search: { type: 'string', description: 'Optional text to match in merchant or description' },
        limit: { type: 'integer', description: 'Max rows (default 100, max 500)' },
      },
    },
  },
  {
    name: 'spending_summary',
    description: "Spending for the current pay period (last paycheck until the day before the next one) against the plan: safe-to-spend, per-day allowance, each bucket's budget/spent/left, bills, India, big purchases, income and what's left over. Includes how many transactions need review.",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_review_queue',
    description: "Transactions the app isn't sure about (new merchants, large one-offs, Zelle/Venmo to or from people, non-salary income), with the app's guess. Ask the user what each is, then call categorize_transaction.",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'categorize_transaction',
    description: `Set a transaction's bucket. Buckets: ${BUCKET_KEYS.join(', ')}. Use "big_purchase" for one-off large buys paid from savings, "ignore" for moving money between the user's own accounts. Money coming in (negative amount) put in food/yourself offsets that bucket, e.g. a friend paying back. Set remember=true to apply to every future transaction from the same merchant.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Transaction id from list_review_queue or get_transactions' },
        bucket: { type: 'string', enum: BUCKET_KEYS },
        note: { type: 'string', description: 'Short note, e.g. "MacBook"' },
        remember: { type: 'boolean', description: 'Create a rule for this merchant' },
      },
      required: ['id', 'bucket'],
    },
  },
  {
    name: 'add_rule',
    description: 'Always put transactions whose merchant/description contains this text into a bucket.',
    inputSchema: {
      type: 'object',
      properties: {
        match: { type: 'string', description: 'Text to match, case-insensitive, e.g. "nibble b" or "spectrum"' },
        bucket: { type: 'string', enum: BUCKET_KEYS },
        note: { type: 'string' },
      },
      required: ['match', 'bucket'],
    },
  },
  {
    name: 'list_rules',
    description: 'The categorization rules saved so far.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'can_i_afford',
    description: 'Check whether a purchase fits the budget before the next paycheck. Returns a verdict (yes / tight / no) and the reason.',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Purchase amount in USD' },
        bucket: { type: 'string', enum: ['food', 'yourself'], description: 'Which budget it comes from (default yourself)' },
      },
      required: ['amount'],
    },
  },
  {
    name: 'get_plan',
    description: 'The monthly money plan: income, fixed bills, flexible buckets, India transfer, and savings target.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'sync_now',
    description: 'Pull the latest transactions and balances from the banks right now.',
    inputSchema: { type: 'object', properties: {} },
  },
];

async function callTool(name, args = {}) {
  switch (name) {
    case 'get_balances': {
      const accounts = await getAccounts();
      const items = check(await db().from('items').select('id,institution,status,last_synced_at,last_error'));
      return {
        totals: cashPosition(accounts),
        accounts: accounts.map((a) => ({
          name: a.name, mask: a.mask, type: a.type, subtype: a.subtype,
          current: a.current, available: a.available, limit: a.credit_limit,
          institution: items.find((i) => i.id === a.item_id)?.institution,
        })),
        connections: items,
      };
    }
    case 'get_transactions': {
      const days = Math.min(Math.max(Number(args.days) || 30, 1), 730);
      const limit = Math.min(Math.max(Number(args.limit) || 100, 1), 500);
      const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
      let q = db().from('transactions')
        .select('id,date,name,merchant_name,amount,category_primary,category_detailed,pending,account_id,bucket_override,note,reviewed_at')
        .gte('date', since)
        .order('date', { ascending: false })
        .limit(limit);
      if (args.search) {
        const s = String(args.search).replace(/[%,()]/g, ' ');
        q = q.or(`name.ilike.%${s}%,merchant_name.ilike.%${s}%`);
      }
      const [rows, ctx] = await Promise.all([q.then(check), loadContext()]);
      return rows.map((t) => {
        const cls = classify(t, ctx);
        return {
          id: t.id, date: t.date, name: t.merchant_name || t.name, description: t.name,
          amount: Number(t.amount), pending: t.pending, plaid_category: t.category_detailed,
          bucket: cls.bucket, bucket_source: cls.source, note: t.note, needs_review: needsReview(t, cls),
        };
      });
    }
    case 'spending_summary': {
      const { transactions, ...summary } = await periodSummary();
      return { ...summary, bucket_labels: BUCKETS };
    }
    case 'list_review_queue':
      return reviewQueue();
    case 'categorize_transaction':
      return categorize(String(args.id), args.bucket, { note: args.note, remember: Boolean(args.remember) });
    case 'add_rule':
      return addRule(args.match, args.bucket, args.note);
    case 'list_rules':
      return check(await db().from('rules').select('match,bucket,note,created_at').order('id'));
    case 'can_i_afford': {
      const amount = Number(args.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount must be a positive number');
      return canIAfford(amount, args.bucket === 'food' ? 'food' : 'yourself');
    }
    case 'get_plan':
      { const { owner, ...plan } = PLAN; return { ...plan, fixedTotal: Math.round(fixedTotal() * 100) / 100 }; }
    case 'sync_now':
      return { results: await syncAll() };
    default:
      throw Object.assign(new Error(`Unknown tool: ${name}`), { rpcCode: -32602 });
  }
}

async function handle(msg) {
  const { id, method, params } = msg || {};
  const isNotification = id === undefined || id === null;
  const reply = (result) => ({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

  try {
    switch (method) {
      case 'initialize':
        return reply({
          protocolVersion: params?.protocolVersion || '2025-06-18',
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: "Arjun's personal money tracker. Budgets run paycheck to paycheck. Use spending_summary or can_i_afford for budget questions. When reviewing, call list_review_queue, ask Arjun about anything unclear, then categorize_transaction (remember=true for repeat merchants). Amounts are USD; positive = money out.",
        });
      case 'ping':
        return reply({});
      case 'tools/list':
        return reply({ tools: TOOLS });
      case 'tools/call': {
        try {
          const data = await callTool(params?.name, params?.arguments || {});
          return reply({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
        } catch (err) {
          if (err.rpcCode) return fail(err.rpcCode, err.message);
          return reply({ content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true });
        }
      }
      default:
        if (isNotification) return null;
        return fail(-32601, `Method not found: ${method}`);
    }
  } catch (err) {
    return isNotification ? null : fail(-32603, err.message);
  }
}

export function mcpSecretOk(candidate) {
  const secret = (process.env.MCP_SECRET || '').trim();
  return Boolean(secret) && safeEqual(String(candidate || '').trim(), secret);
}

export async function handleMcpPost(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 });
  }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(handle))).filter(Boolean);
    return out.length ? NextResponse.json(out) : new NextResponse(null, { status: 202 });
  }
  const out = await handle(body);
  return out ? NextResponse.json(out) : new NextResponse(null, { status: 202 });
}

// No server-initiated stream; clients fall back to plain POST responses.
export const methodNotAllowed = () => new NextResponse(null, { status: 405, headers: { Allow: 'POST' } });
