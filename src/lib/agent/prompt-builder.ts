import { ToolDefinition } from './types';

export function buildSystemPrompt(
  basePrompt: string,
  tools: ToolDefinition[],
  memories: string[] = []
): string {
  let prompt = basePrompt;

  if (memories.length > 0) {
    prompt += '\n\n## 관련 기억\n';
    prompt += memories.map((m) => `- ${m}`).join('\n');
  }

  prompt += '\n\n## 사용 가능한 도구\n\n';
  prompt += '도구를 사용하려면 다음 형식으로 응답하세요:\n\n';
  prompt += '```\n<tool_call>\n{"name": "도구명", "arguments": {"param": "value"}}\n</tool_call>\n```\n\n';
  prompt += '도구 사용 규칙:\n';
  prompt += '- 도구를 사용할 때는 반드시 위 형식을 정확히 따르세요\n';
  prompt += '- 한 번에 하나의 도구만 호출하세요\n';
  prompt += '- 도구 결과를 확인한 후 필요하면 추가 도구를 호출하세요\n';
  prompt += '- 최종 답변을 할 때는 도구를 호출하지 마세요\n\n';

  prompt += '### 도구 목록\n\n';

  for (const tool of tools) {
    prompt += `#### ${tool.name}\n`;
    prompt += `${tool.description}\n`;
    prompt += '매개변수:\n';
    for (const param of tool.parameters) {
      const req = param.required ? '필수' : '선택';
      prompt += `- \`${param.name}\` (${param.type}, ${req}): ${param.description}\n`;
    }
    prompt += '\n';
  }

  prompt += '### 예시\n\n';
  prompt += '사용자: 내 Documents 폴더에 무슨 파일이 있어?\n\n';
  prompt += '어시스턴트: Documents 폴더의 파일 목록을 확인하겠습니다.\n\n';
  prompt += '<tool_call>\n{"name": "filesystem_list", "arguments": {"path": "/Users/lizeling/Documents"}}\n</tool_call>\n';

  return prompt;
}
