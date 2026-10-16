import { NextResponse } from 'next/server';
import { safeEqual } from '../../../../lib/session';
import { getAccounts, cashPosition, monthSummary, canIAfford, PLAN, fixedTotal, bucketOf } from '../../../../lib/budget';
import { db, check } from '../../../../lib/db';
import { syncAll } from '../../../../lib/sync';

export const runtime = 'nodejs';
export const maxDuration = 60;

// A small MCP server (Streamable HTTP, JSON responses, stateless) so Claude can
// read this app's data. The secret lives in the URL because claude.ai custom
// connectors can't send custom headers. Treat the full URL like a password.

const SERVER_INFO = { name: 'money-tracker', version: '0.1.0' };

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
    description: "This month's spending against the plan: safe-to-spend, per-day allowance, each bucket's budget/spent/left, bills, money sent to India, and savings moved.",
    inputSchema: {
      type: 'object',
      properties: { month: { type: 'string', description: 'YYYY-MM, defaults to the current month' } },
    },
  },
  {
    name: 'can_i_afford',
    description: 'Check whether a purchase fits the budget this month. Returns a verdict (yes / tight / no) and the reason.',
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
        .select('date,name,merchant_name,amount,category_primary,category_detailed,pending,account_id')
        .gte('date', since)
        .order('date', { ascending: false })
        .limit(limit);
      if (args.search) {
        const s = String(args.search).replace(/[%,()]/g, ' ');
        q = q.or(`name.ilike.%${s}%,merchant_name.ilike.%${s}%`);
      }
      const rows = check(await q);
      return rows.map((t) => ({ ...t, bucket: bucketOf(t) }));
    }
    case 'spending_summary': {
      const { transactions, ...summary } = await monthSummary(args.month);
      return summary;
    }
    case 'can_i_afford': {
      const amount = Number(args.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount must be a positive number');
      return canIAfford(amount, args.bucket === 'food' ? 'food' : 'yourself');
    }
    case 'get_plan':
      return { ...PLAN, fixedTotal: Math.round(fixedTotal() * 100) / 100 };
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
          instructions: "Arjun's personal money tracker. Use spending_summary or can_i_afford for budget questions; amounts are USD.",
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

async function authorized(params) {
  const { token } = await params;
  const secret = process.env.MCP_SECRET;
  return Boolean(secret) && safeEqual(String(token || ''), secret);
}

export async function POST(req, { params }) {
  if (!(await authorized(params))) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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

export async function GET(req, { params }) {
  if (!(await authorized(params))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // No server-initiated stream; clients fall back to plain POST responses.
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } });
}

export async function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } });
}
