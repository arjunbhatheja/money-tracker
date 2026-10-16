import { NextResponse } from 'next/server';
import { mcpSecretOk, handleMcpPost, methodNotAllowed } from '../../../lib/mcp';

export const runtime = 'nodejs';
export const maxDuration = 60;

// MCP with the secret in a request header: X-MCP-Secret: <MCP_SECRET>
// (or Authorization: Bearer <MCP_SECRET>).
function secretFrom(req) {
  const h = req.headers.get('x-mcp-secret');
  if (h) return h;
  const auth = req.headers.get('authorization') || '';
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '';
}

const unauthorized = () => NextResponse.json({ error: 'Missing or wrong MCP secret' }, { status: 401 });

export async function POST(req) {
  return mcpSecretOk(secretFrom(req)) ? handleMcpPost(req) : unauthorized();
}

export async function GET(req) {
  return mcpSecretOk(secretFrom(req)) ? methodNotAllowed() : unauthorized();
}

export const DELETE = methodNotAllowed;
