/**
 * 메모리 스크러빙 유틸리티
 *
 * 메모리에 저장하기 전에 불필요하거나 민감한 데이터를 제거한다:
 * - 파일 업로드 경로
 * - base64 이미지 데이터
 * - 임시 파일 경로
 * - 매우 긴 코드 블록 (500자 이상)
 */

const SCRUB_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  // 파일 업로드 경로 (/tmp/upload-xxx, /data/uploads/xxx)
  {
    pattern: /\/(?:tmp\/upload|data\/uploads\/)[^\s,.)]*\S*/gi,
    replacement: '[파일 참조 제거됨]',
  },
  // base64 이미지 데이터 (data:image/...;base64,...)
  {
    pattern: /data:[a-z]+\/[a-z+]+;base64,[A-Za-z0-9+/=]{20,}/g,
    replacement: '[이미지 데이터 제거됨]',
  },
  // 임시 파일 경로 (/tmp/xxx)
  {
    pattern: /\/tmp\/[^\s,.)]+/g,
    replacement: '[임시 경로 제거됨]',
  },
  // 매우 긴 코드 블록 (500자 이상의 ``` 블록)
  {
    pattern: /```[\s\S]{500,}?```/g,
    replacement: '[긴 코드 블록 제거됨]',
  },
];

export function scrubMemoryText(text: string): string {
  let result = text;
  for (const { pattern, replacement } of SCRUB_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result.trim();
}
