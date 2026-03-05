import { NextRequest, NextResponse } from 'next/server';
import { resolveApproval } from '@/lib/agent/approval';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { confirmId, approved } = body;

    // Input validation
    if (typeof confirmId !== 'string' || !confirmId || confirmId.length > 200) {
      return NextResponse.json({ error: 'Invalid confirmId' }, { status: 400 });
    }
    if (typeof approved !== 'boolean') {
      return NextResponse.json({ error: 'Invalid approved value' }, { status: 400 });
    }

    const found = resolveApproval(confirmId, approved);
    if (!found) {
      return NextResponse.json({ error: 'Approval request not found or expired' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
