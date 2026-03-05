# OllamaAgent

로컬 Ollama 모델을 활용한 AI 에이전트 챗 애플리케이션. 도구 실행, 파일 시스템 접근, 웹 검색, 이미지 생성, 코드 실행 등 다양한 에이전트 기능을 제공합니다.

## 주요 기능

- **AI 채팅** — Ollama 모델과 실시간 스트리밍 대화
- **도구 실행** — 파일 읽기/쓰기, 웹 검색, HTTP 요청, 코드 실행
- **이미지 분석/생성** — 이미지 첨부 분석 및 AI 이미지 생성
- **메모리 시스템** — RAG 기반 대화 기억 및 검색
- **멀티 모델** — 대화 중 모델 전환 가능
- **음성 입출력** — STT/TTS 지원
- **MCP 서버** — Model Context Protocol 도구 확장
- **대화 관리** — 폴더, 태그, 검색, 내보내기/가져오기
- **프롬프트 템플릿** — 사전 정의된 시스템 프롬프트
- **통계 대시보드** — 사용량 및 활동 통계
- **다크/라이트 테마** — 시스템 테마 연동

## 기술 스택

- **Framework**: Next.js 16, React 19
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **Testing**: Vitest, Playwright
- **AI Backend**: Ollama (로컬)
- **Package Manager**: pnpm

## 시작하기

### 사전 요구사항

- Node.js 18+
- pnpm
- [Ollama](https://ollama.ai/) 설치 및 실행

### 설치

```bash
pnpm install
```

### 개발 서버

```bash
pnpm dev
```

[http://localhost:3000](http://localhost:3000)에서 실행됩니다.

### 빌드

```bash
pnpm build
pnpm start
```

### 테스트

```bash
# 단위 테스트
pnpm test

# E2E 테스트
pnpm exec playwright test
```

## 프로젝트 구조

```
src/
├── app/            # Next.js App Router (API routes, pages)
├── components/     # React 컴포넌트
│   ├── chat/       # 채팅 UI (메시지, 입력, 컨테이너)
│   ├── markdown/   # 마크다운 렌더링
│   ├── settings/   # 설정 패널
│   ├── sidebar/    # 사이드바
│   ├── ui/         # 공통 UI 컴포넌트
│   └── voice/      # 음성 입출력
├── hooks/          # React 커스텀 훅
├── lib/            # 서버 사이드 라이브러리
│   ├── agent/      # 에이전트 루프 로직
│   ├── config/     # 설정 관리
│   ├── conversations/ # 대화 저장소
│   ├── memory/     # RAG 메모리 시스템
│   ├── mcp/        # MCP 클라이언트
│   ├── ollama/     # Ollama API 클라이언트
│   └── tools/      # 도구 레지스트리 및 구현
└── types/          # TypeScript 타입 정의
```

## 라이선스

MIT
