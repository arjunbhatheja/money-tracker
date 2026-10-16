import { NextResponse } from 'next/server';
import { mcpSecretOk, handleMcpPost, methodNotAllowed } from '../../../../lib/mcp';

export const runtime = 'nodejs';
export const maxDuration = 60;

// MCP with the secret in the URL: /api/mcp/<MCP_SECRET>
const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 });

export async function POST(req, { params }) {
  const { token } = await params;
  return mcpSecretOk(decodeURIComponent(token || '')) ? handleMcpPost(req) : notFound();
}

export async function GET(req, { params }) {
  const { token } = await params;
  return mcpSecretOk(decodeURIComponent(token || '')) ? methodNotAllowed() : notFound();
}

export const DELETE = methodNotAllowed;
