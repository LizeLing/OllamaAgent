# RAG 메모리 관리 인터페이스 설계

**날짜:** 2026-03-11
**상태:** 승인됨

## 개요

설정 패널에 "메모리" 탭을 추가하여 RAG 메모리를 전체 관리할 수 있는 인터페이스를 구현한다.

## 요구사항

- 임베딩 모델을 설정 UI에서 선택 가능
- 저장된 메모리를 테이블 형태로 조회/검색/필터/정렬/삭제
- 텍스트, 파일(txt/md/pdf), URL을 통한 수동 메모리 추가
- 카테고리별 가중치와 만료 정책을 UI에서 조정

## 설계

### 1. 설정 패널 구조 변경

SETTING_TABS 배열에 `{ id: 'memory', label: '메모리', icon: '🧠' }` 추가.

새 파일: `src/components/settings/tabs/MemoryTab.tsx`

MemoryTab 내부 레이아웃 (위→아래):
1. 임베딩 모델 선택
2. 카테고리 정책 설정
3. 메모리 통계 + 테이블
4. 수동 추가 폼

### 2. 임베딩 모델 선택

- `/api/models`에서 가져온 모델 목록으로 드롭다운 구성 (ModelTab과 동일 패턴)
- `draft.embeddingModel` 바인딩
- HelpTooltip: "RAG 메모리 검색에 사용할 임베딩 모델입니다"

### 3. 카테고리 정책 설정

Settings 타입에 새 필드 추가:

```ts
interface MemoryCategoryConfig {
  weight: number;    // 0.1~3.0
  maxAgeDays: number; // 1~365
}

// Settings에 추가
memoryCategories: Record<string, MemoryCategoryConfig>;
```

기본값:

| 카테고리 | 가중치 | 만료일(일) |
|----------|--------|-----------|
| technical | 1.2 | 60 |
| research | 1.0 | 30 |
| preference | 1.5 | 90 |
| general | 0.8 | 14 |

`structured-memory.ts`의 하드코딩된 값을 Settings에서 참조하도록 변경.

### 4. 메모리 테이블

컬럼: 선택(체크박스) | 내용(50자 truncate) | 카테고리(뱃지) | 생성일 | 액션(삭제)

기능:
- 검색바: 클라이언트 사이드 텍스트 필터링
- 카테고리 필터: 드롭다운 (전체/technical/research/preference/general)
- 정렬: 생성일 기준 최신순/오래된순 토글
- 일괄 선택: 헤더 체크박스 → "선택 삭제" 버튼
- 행 클릭: 내용 전체 보기 (expand row)
- 페이지네이션: 20개 단위

통계 표시 (테이블 상단):
- "총 42개 — technical 15 · research 8 · preference 12 · general 7"

### 5. 수동 추가 폼

3개 탭 전환: [텍스트] [파일] [URL]

**텍스트:** textarea + 카테고리 드롭다운 + "추가" 버튼
**파일:** 파일 선택(.txt/.md/.pdf) + 카테고리 드롭다운 + "업로드 & 저장" 버튼
**URL:** URL 입력 + 카테고리 드롭다운 + "크롤링 & 저장" 버튼

### 6. API 변경

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/memory?list=true&page=1&limit=20&category=...` | 메모리 목록 (페이지네이션) |
| POST | `/api/memory` | 수동 추가 (text/file/url) |
| DELETE | `/api/memory/[id]` | 개별 삭제 |
| DELETE | `/api/memory/bulk` | 일괄 삭제 `{ ids: string[] }` |

POST body:
- text: `{ type: 'text', content: string, category: string }`
- file: multipart/form-data
- url: `{ type: 'url', content: string(url), category: string }`

### 7. 변경 대상 파일

| 파일 | 변경 |
|------|------|
| `src/types/settings.ts` | `MemoryCategoryConfig` 인터페이스, `memoryCategories` 필드 추가 |
| `src/lib/config/constants.ts` | `DEFAULT_SETTINGS`에 `memoryCategories` 기본값 추가 |
| `src/components/settings/SettingsPanel.tsx` | SETTING_TABS에 메모리 탭 추가 |
| `src/components/settings/tabs/MemoryTab.tsx` | 새 파일 — 전체 메모리 관리 UI |
| `src/app/api/memory/route.ts` | GET 확장(목록), POST 추가(수동 저장) |
| `src/app/api/memory/[id]/route.ts` | 새 파일 — DELETE 개별 삭제 |
| `src/app/api/memory/bulk/route.ts` | 새 파일 — DELETE 일괄 삭제 |
| `src/lib/memory/structured-memory.ts` | 하드코딩 → Settings 참조 |
| `src/lib/memory/memory-manager.ts` | 수동 추가 메서드 (파일 파싱, URL 크롤링) |
