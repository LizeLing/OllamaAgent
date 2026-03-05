'use client';

import EventHookEditor from '../EventHookEditor';
import HelpTooltip from '@/components/ui/HelpTooltip';

export default function AutomationTab() {
  return (
    <div>
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-foreground">이벤트 훅</h3>
          <HelpTooltip text="에이전트 이벤트 발생 시 자동으로 액션을 실행합니다.\n\n액션 유형: Webhook, Log, Memory Save" />
        </div>
        <EventHookEditor />
      </section>
    </div>
  );
}
