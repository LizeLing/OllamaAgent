'use client';

import { Settings } from '@/types/settings';
import CustomToolEditor from '../CustomToolEditor';
import McpServerManager from '../McpServerManager';
import SkillEditor from '../SkillEditor';
import HelpTooltip from '@/components/ui/HelpTooltip';

interface ExtensionsTabProps {
  draft: Partial<Settings>;
  onDraftChange: (updates: Partial<Settings>) => void;
}

const HELP = {
  customTools:
    '외부 HTTP API를 도구로 등록하여 에이전트가 호출할 수 있게 합니다.',
  mcpServers:
    'MCP 서버를 연결하여 에이전트의 기능을 확장합니다.',
  skills:
    '다단계 워크플로우를 정의하여 에이전트가 복잡한 작업을 수행하도록 합니다.',
  subagent:
    '메인 에이전트가 전문 하위 에이전트에게 작업을 위임합니다.',
};

export default function ExtensionsTab({ draft, onDraftChange }: ExtensionsTabProps) {
  return (
    <div className="space-y-8">
      {/* Custom Tools */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-foreground">커스텀 도구</h3>
          <HelpTooltip text={HELP.customTools} />
        </div>
        <CustomToolEditor
          customTools={draft.customTools || []}
          onChange={(tools) => onDraftChange({ customTools: tools })}
        />
      </section>

      <hr className="border-border" />

      {/* MCP Servers */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-foreground">MCP 서버</h3>
          <HelpTooltip text={HELP.mcpServers} />
        </div>
        <McpServerManager
          servers={draft.mcpServers || []}
          onChange={(servers) => onDraftChange({ mcpServers: servers })}
        />
      </section>

      <hr className="border-border" />

      {/* Skills */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-foreground">스킬</h3>
          <HelpTooltip text={HELP.skills} />
        </div>
        <SkillEditor />
      </section>

      <hr className="border-border" />

      {/* Sub-Agents */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-foreground">서브에이전트</h3>
          <HelpTooltip text={HELP.subagent} />
        </div>
        <div className="bg-card rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-background rounded-lg">
              <div className="text-lg mb-1">💻</div>
              <div className="text-xs font-medium">Coder</div>
              <div className="text-[10px] text-muted mt-0.5">파일 탐색, 코드 작성</div>
            </div>
            <div className="text-center p-3 bg-background rounded-lg">
              <div className="text-lg mb-1">🔬</div>
              <div className="text-xs font-medium">Researcher</div>
              <div className="text-[10px] text-muted mt-0.5">웹 검색, 정보 수집</div>
            </div>
            <div className="text-center p-3 bg-background rounded-lg">
              <div className="text-lg mb-1">📊</div>
              <div className="text-xs font-medium">Analyst</div>
              <div className="text-[10px] text-muted mt-0.5">데이터 분석, 시각화</div>
            </div>
          </div>
          <p className="text-xs text-muted">최대 중첩 깊이: 2단계. 에이전트가 필요 시 자동으로 서브에이전트를 호출합니다.</p>
        </div>
      </section>
    </div>
  );
}
