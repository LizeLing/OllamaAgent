import { NextRequest, NextResponse } from 'next/server';
import { resolveApproval } from '@/lib/agent/approval';

export async function POST(request: NextRequest) {
  const { confirmId, approved } = await request.json();
  resolveApproval(confirmId, approved);
  return NextResponse.json({ success: true });
}
