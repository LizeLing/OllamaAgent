# Phase 4: 긴급 버그 수정 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 5개의 긴급 버그/보안 이슈를 수정하여 애플리케이션의 안정성과 보안을 확보한다.

**Architecture:** 각 버그는 독립적이므로 2개 에이전트로 병렬 처리. Agent A는 서버 사이드(1,2,3번), Agent B는 클라이언트+API(4,5번)를 담당.

**Tech Stack:** Next.js 16, TypeScript, React 19, Tailwind CSS 4

---

## Agent A: 서버 사이드 버그 수정 (Task 1, 2, 3)

### Task 1: 위험 도구 이름 오타 수정

**Files:**
- Modify: `src/lib/agent/agent-loop.ts:93`

**문제:** `DANGEROUS_TOOLS` 배열에 `'code_executor'`로 되어 있으나, 실제 등록된 도구 이름은 `'code_execute'`이다. 결과적으로 `deny-dangerous` 모드에서 코드 실행이 차단되지 않는 심각한 보안 버그.

**Step 1: 수정**

`src/lib/agent/agent-loop.ts` 93행을 수정:

```typescript
// Before:
const DANGEROUS_TOOLS = ['code_executor', 'filesystem_write'];

// After:
const DANGEROUS_TOOLS = ['code_execute', 'filesystem_write'];
```

**Step 2: 커밋**

```bash
git add src/lib/agent/agent-loop.ts
git commit -m "fix: DANGEROUS_TOOLS에서 code_executor → code_execute 오타 수정

deny-dangerous 모드에서 코드 실행 도구가 실제로 차단되지 않던 보안 버그 수정"
```

---

### Task 2: 폴더 삭제 시 대화 미분류 복구

**Files:**
- Modify: `src/lib/conversations/folders.ts:49-53`
- Modify: `src/lib/conversations/storage.ts` (새 함수 추가)
- Modify: `src/app/api/folders/[id]/route.ts:21-32`

**문제:** `deleteFolder`가 폴더만 삭제하고, 해당 폴더에 속한 대화들의 `folderId`를 초기화하지 않음. 결과적으로 대화가 "고정됨" 섹션에도, "미분류"에도, 삭제된 폴더 그룹에도 표시되지 않아 사라진다.

**Step 1: storage.ts에 clearFolderFromConversations 함수 추가**

`src/lib/conversations/storage.ts` 파일 끝에 추가:

```typescript
export async function clearFolderFromConversations(folderId: string): Promise<void> {
  const index = await readIndex();
  let changed = false;

  for (const meta of index) {
    if (meta.folderId === folderId) {
      meta.folderId = undefined;
      changed = true;

      // Update the conversation file too
      try {
        const filePath = path.join(CONVERSATIONS_DIR, `${meta.id}.json`);
        const data = await fs.readFile(filePath, 'utf-8');
        const conv = JSON.parse(data);
        delete conv.folderId;
        await fs.writeFile(filePath, JSON.stringify(conv, null, 2));
      } catch {
        // conversation file may not exist
      }
    }
  }

  if (changed) {
    await writeIndex(index);
  }
}
```

**Step 2: folders/[id]/route.ts DELETE에서 대화 복구 호출**

`src/app/api/folders/[id]/route.ts` DELETE 함수를 수정:

```typescript
import { updateFolder, deleteFolder } from '@/lib/conversations/folders';
import { clearFolderFromConversations } from '@/lib/conversations/storage';

// ... PUT은 그대로 ...

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    // Move conversations out of the folder first
    await clearFolderFromConversations(id);
    await deleteFolder(id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 });
  }
}
```

**Step 3: 커밋**

```bash
git add src/lib/conversations/storage.ts src/app/api/folders/\[id\]/route.ts
git commit -m "fix: 폴더 삭제 시 소속 대화를 미분류로 복구

폴더 삭제 시 해당 폴더의 대화들이 UI에서 사라지던 버그 수정.
deleteFolder 호출 전 clearFolderFromConversations로 folderId 초기화."
```

---

### Task 3: prompt-builder.ts 데드코드 및 개인정보 노출 제거

**Files:**
- Delete: `src/lib/agent/prompt-builder.ts`

**문제:**
- `prompt-builder.ts`는 어디에서도 import되지 않는 데드코드
- 40행에 `/Users/lizeling/Documents` 하드코딩 경로가 있어 LLM에 개인정보가 노출될 수 있음 (현재 미사용이지만 위험)
- agent-loop.ts에서 시스템 프롬프트를 직접 구성하므로 이 파일은 불필요

**Step 1: 파일이 실제로 미사용인지 확인**

```bash
grep -r "prompt-builder" src/ --include="*.ts" --include="*.tsx"
```

Expected: `src/lib/agent/prompt-builder.ts` 자체만 나오고, 다른 파일에서 import하는 곳이 없어야 함.

**Step 2: 파일 삭제**

```bash
rm src/lib/agent/prompt-builder.ts
```

**Step 3: 커밋**

```bash
git add src/lib/agent/prompt-builder.ts
git commit -m "fix: 미사용 prompt-builder.ts 삭제 (개인정보 경로 노출 제거)

agent-loop.ts에서 직접 시스템 프롬프트를 구성하므로 데드코드.
하드코딩된 /Users/lizeling/Documents 경로가 포함되어 있어 보안 위험."
```

---

## Agent B: 클라이언트 + API 버그 수정 (Task 4, 5)

### Task 4: 테마 플래시(FOUC) 수정

**Files:**
- Modify: `src/app/layout.tsx:32-39`

**문제:** `layout.tsx`에서 `data-theme="dark"`을 하드코딩하고, `useTheme` 훅이 클라이언트에서 `useEffect`로 localStorage를 읽어 테마를 적용한다. 결과적으로:
1. 서버에서 `dark` HTML 렌더링
2. 클라이언트 하이드레이션 시 `useEffect` 실행
3. localStorage에서 `light` 또는 `system` 읽으면 테마 변경
4. 눈에 보이는 깜빡임(Flash of Unstyled Content)

**해결:** `<body>` 시작 전에 인라인 스크립트로 테마를 즉시 적용. React 하이드레이션 전에 실행되므로 깜빡임 없음.

**Step 1: layout.tsx 수정**

`src/app/layout.tsx` 전체를 다음으로 교체:

```typescript
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import 'highlight.js/styles/github-dark.css';

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OllamaAgent",
  description: "AI Agent powered by Ollama",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const themeScript = `
(function() {
  try {
    var theme = localStorage.getItem('theme') || 'dark';
    if (theme === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', theme);
  } catch(e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-[family-name:var(--font-inter)] antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
```

핵심 변경:
- `data-theme="dark"` 제거 → `suppressHydrationWarning` 추가 (인라인 스크립트로 속성이 변경되므로 하이드레이션 경고 방지)
- `<head>`에 인라인 스크립트 추가: localStorage에서 테마를 읽어 즉시 `data-theme` 적용
- 스크립트는 동기적으로 실행되므로 렌더링 전에 테마가 적용됨

**Step 2: 커밋**

```bash
git add src/app/layout.tsx
git commit -m "fix: 테마 플래시(FOUC) 수정 - 인라인 스크립트로 즉시 테마 적용

하드코딩된 data-theme='dark' 대신 인라인 스크립트로 localStorage 테마를
렌더링 전 즉시 적용하여 페이지 로드 시 깜빡임 제거."
```

---

### Task 5: 파일 업로드 크기 제한 추가

**Files:**
- Modify: `src/app/api/upload/route.ts:9-15`

**문제:** 파일 업로드에 크기 제한이 없어서 대용량 파일 업로드 시 서버 메모리 부족 및 디스크 폭발 위험. 텍스트 파일은 이미 5000자로 잘리지만, 바이너리 파일(이미지 등)은 무제한.

**Step 1: 크기 제한 추가**

`src/app/api/upload/route.ts`에 파일 크기 검증 추가:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { loadSettings } from '@/lib/config/settings';
import { MemoryManager } from '@/lib/memory/memory-manager';
import { DATA_DIR } from '@/lib/config/constants';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = [
  '.txt', '.md', '.json', '.csv', '.log',
  '.ts', '.js', '.py', '.java', '.c', '.cpp', '.h', '.go', '.rs', '.rb', '.php',
  '.html', '.css', '.xml', '.yaml', '.yml', '.toml',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
  '.pdf', '.zip',
];

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // File size check
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `파일 크기가 너무 큽니다. 최대 ${MAX_FILE_SIZE / 1024 / 1024}MB까지 업로드 가능합니다.` },
        { status: 413 }
      );
    }

    // Extension check
    const ext = path.extname(file.name).toLowerCase();
    if (ext && !ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: `허용되지 않는 파일 형식입니다: ${ext}` },
        { status: 400 }
      );
    }

    const uploadsDir = path.join(DATA_DIR, 'uploads');
    await fs.mkdir(uploadsDir, { recursive: true });

    const filename = `${uuidv4()}${ext}`;
    const filepath = path.join(uploadsDir, filename);

    const bytes = await file.arrayBuffer();
    await fs.writeFile(filepath, Buffer.from(bytes));

    // If text file, read content and try to save to memory
    const textExtensions = ['.txt', '.md', '.json', '.csv', '.log', '.ts', '.js', '.py', '.java', '.c', '.cpp', '.h', '.go', '.rs', '.rb', '.php', '.html', '.css', '.xml', '.yaml', '.yml', '.toml'];
    const isText = textExtensions.includes(ext);
    let textContent: string | undefined;

    if (isText) {
      textContent = Buffer.from(bytes).toString('utf-8');
      // Save to memory
      try {
        const settings = await loadSettings();
        const memoryManager = new MemoryManager(settings.ollamaUrl, settings.embeddingModel);
        await memoryManager.saveMemory(
          `File: ${file.name}\n${textContent.slice(0, 2000)}`,
          { type: 'upload', filename: file.name }
        );
      } catch {
        // Memory save failed, file is still uploaded
      }
    }

    return NextResponse.json({
      filename,
      originalName: file.name,
      path: filepath,
      size: file.size,
      content: textContent?.slice(0, 5000),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
```

핵심 변경:
- `MAX_FILE_SIZE`: 10MB 제한 (413 status 반환)
- `ALLOWED_EXTENSIONS`: 허용된 파일 확장자 화이트리스트
- 텍스트 확장자 목록 확장 (프로그래밍 언어 파일 포함)

**Step 2: 커밋**

```bash
git add src/app/api/upload/route.ts
git commit -m "fix: 파일 업로드 크기 제한(10MB) 및 확장자 검증 추가

무제한 파일 업로드로 인한 디스크/메모리 폭발 위험 방지.
- 10MB 최대 크기 제한 (413 응답)
- 허용된 확장자 화이트리스트 검증
- 텍스트 파일 확장자 목록 확장 (프로그래밍 언어 포함)"
```

---

## 에이전트 구성

| 에이전트 | 작업 | 파일 |
|----------|------|------|
| **Agent A** (서버) | Task 1, 2, 3 | agent-loop.ts, storage.ts, folders/[id]/route.ts, prompt-builder.ts |
| **Agent B** (클라이언트+API) | Task 4, 5 | layout.tsx, upload/route.ts |

파일 충돌 없음 → 완전 병렬 실행 가능.
