import { NextRequest, NextResponse } from 'next/server';
import { DATA_DIR } from '@/lib/config/constants';
import { atomicWriteJSON, safeReadJSON } from '@/lib/storage/atomic-write';
import { errorResponse } from '@/lib/errors';
import { Artifact } from '@/types/artifacts';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const ARTIFACTS_DIR = path.join(DATA_DIR, 'artifacts');

export async function GET(request: NextRequest) {
  try {
    const conversationId = request.nextUrl.searchParams.get('conversationId');

    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
    const files = await fs.readdir(ARTIFACTS_DIR);
    const artifacts: Artifact[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const data = await safeReadJSON<Artifact | null>(
        path.join(ARTIFACTS_DIR, file),
        null
      );
      if (!data) continue;
      if (!conversationId || data.conversationId === conversationId) {
        artifacts.push(data);
      }
    }

    // 최신순 정렬
    artifacts.sort((a, b) => b.createdAt - a.createdAt);

    return NextResponse.json(artifacts);
  } catch (error) {
    const { body, status } = errorResponse(error, '아티팩트 목록 조회 실패');
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, name, content, language, conversationId } = body;

    if (!type || !name || !content || !conversationId) {
      return NextResponse.json(
        { error: '필수 필드 누락 (type, name, content, conversationId)' },
        { status: 400 }
      );
    }

    if (!['code', 'image', 'file'].includes(type)) {
      return NextResponse.json(
        { error: '유효하지 않은 타입 (code, image, file 중 하나)' },
        { status: 400 }
      );
    }

    const artifact: Artifact = {
      id: uuidv4(),
      type,
      name,
      content,
      language: type === 'code' ? language : undefined,
      conversationId,
      createdAt: Date.now(),
    };

    await atomicWriteJSON(
      path.join(ARTIFACTS_DIR, `${artifact.id}.json`),
      artifact
    );

    return NextResponse.json(artifact, { status: 201 });
  } catch (error) {
    const { body, status } = errorResponse(error, '아티팩트 저장 실패');
    return NextResponse.json(body, { status });
  }
}
