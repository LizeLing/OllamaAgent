import { describe, it, expect } from 'vitest';
import { scrubMemoryText } from '../scrubber';

describe('scrubMemoryText', () => {
  it('파일 업로드 경로를 제거한다 (/tmp/upload-xxx)', () => {
    const text = 'User uploaded file: /tmp/upload-abc123.pdf. 이 PDF를 분석해주세요.';
    const result = scrubMemoryText(text);
    expect(result).not.toContain('/tmp/upload');
    expect(result).toContain('[파일 참조 제거됨]');
    expect(result).toContain('이 PDF를 분석해주세요.');
  });

  it('파일 업로드 경로를 제거한다 (/data/uploads/xxx)', () => {
    const text = '파일 경로: /data/uploads/temp-xyz.csv를 읽었습니다.';
    const result = scrubMemoryText(text);
    expect(result).not.toContain('/data/uploads/');
    expect(result).toContain('[파일 참조 제거됨]');
    expect(result).toContain('읽었습니다.');
  });

  it('base64 이미지 데이터를 제거한다', () => {
    const base64Data = 'A'.repeat(100);
    const text = `Image data: data:image/png;base64,${base64Data} 이미지를 분석했습니다.`;
    const result = scrubMemoryText(text);
    expect(result).not.toContain('base64');
    expect(result).toContain('[이미지 데이터 제거됨]');
    expect(result).toContain('이미지를 분석했습니다.');
  });

  it('다양한 이미지 형식의 base64를 제거한다', () => {
    const text = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAA 처리 완료';
    const result = scrubMemoryText(text);
    expect(result).toContain('[이미지 데이터 제거됨]');
    expect(result).toContain('처리 완료');
  });

  it('임시 파일 경로를 제거한다', () => {
    const text = '처리 결과를 /tmp/result-12345.json에 저장했습니다.';
    const result = scrubMemoryText(text);
    expect(result).not.toContain('/tmp/result');
    expect(result).toContain('[임시 경로 제거됨]');
  });

  it('매우 긴 코드 블록을 제거한다 (500자 이상)', () => {
    const longCode = 'x'.repeat(600);
    const text = `코드를 작성했습니다:\n\`\`\`typescript\n${longCode}\n\`\`\`\n완료.`;
    const result = scrubMemoryText(text);
    expect(result).not.toContain(longCode);
    expect(result).toContain('[긴 코드 블록 제거됨]');
    expect(result).toContain('완료.');
  });

  it('500자 미만의 코드 블록은 유지한다', () => {
    const shortCode = 'console.log("hello")';
    const text = `코드:\n\`\`\`\n${shortCode}\n\`\`\``;
    const result = scrubMemoryText(text);
    expect(result).toContain(shortCode);
  });

  it('일반 텍스트는 변경하지 않는다', () => {
    const text = '사용자가 React 컴포넌트 작성을 요청했습니다.';
    expect(scrubMemoryText(text)).toBe(text);
  });

  it('여러 패턴이 동시에 적용된다', () => {
    const text = '/tmp/upload-abc.pdf를 읽고 data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAA 분석';
    const result = scrubMemoryText(text);
    expect(result).toContain('[파일 참조 제거됨]');
    expect(result).toContain('[이미지 데이터 제거됨]');
  });

  it('빈 문자열을 처리한다', () => {
    expect(scrubMemoryText('')).toBe('');
  });
});
