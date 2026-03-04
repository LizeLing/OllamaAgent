import { NextRequest, NextResponse } from 'next/server';
import { listFolders, createFolder } from '@/lib/conversations/folders';

export async function GET() {
  try {
    const folders = await listFolders();
    return NextResponse.json(folders);
  } catch {
    return NextResponse.json({ error: 'Failed to list folders' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, color } = await request.json();
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    const folder = await createFolder(name, color || '#6366f1');
    return NextResponse.json(folder, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 });
  }
}
