import { NextResponse } from 'next/server';
import { syncAll } from '../../../../lib/sync';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST() {
  try {
    return NextResponse.json({ results: await syncAll() });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
