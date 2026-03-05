import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { generateApiKey, hashKey, getKeyPrefix } from '@/lib/webhooks/auth';
import { loadKeys, addKey, removeKey } from '@/lib/webhooks/storage';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limiter';

export async function GET() {
  try {
    const keys = await loadKeys();
    const safeKeys = keys.map(({ keyHash: _, ...rest }) => rest);
    return NextResponse.json(safeKeys);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load keys' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    if (!checkRateLimit(`webhook-keys:${ip}`, RATE_LIMITS.api)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    let name = 'Unnamed Key';
    try {
      const body = await request.json();
      if (body.name && typeof body.name === 'string') {
        name = body.name.trim().slice(0, 50);
        if (!name) name = 'Unnamed Key';
      }
    } catch {
      // Use default name if body is empty or invalid
    }

    const key = generateApiKey();
    const keyHashValue = hashKey(key);
    const keyPrefixValue = getKeyPrefix(key);
    const id = uuidv4();
    const createdAt = Date.now();

    const newKey = {
      id,
      name,
      keyHash: keyHashValue,
      keyPrefix: keyPrefixValue,
      createdAt,
    };

    await addKey(newKey);

    return NextResponse.json(
      {
        id,
        name,
        keyHash: keyHashValue,
        keyPrefix: keyPrefixValue,
        createdAt,
        key,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create key' },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
    }

    const removed = await removeKey(id);
    if (!removed) {
      return NextResponse.json({ error: 'Key not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete key' },
      { status: 500 }
    );
  }
}
