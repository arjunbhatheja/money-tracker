import { NextResponse } from 'next/server';
import { createLinkToken } from '../../../../lib/plaid';

export const runtime = 'nodejs';

export async function POST() {
  try {
    return NextResponse.json({ link_token: await createLinkToken() });
  } catch (err) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: 500 });
  }
}
