'use client';

import EventHookEditor from '../EventHookEditor';
import CronJobEditor from '../CronJobEditor';
import HelpTooltip from '@/components/ui/HelpTooltip';

const HELP = {
  hooks:
    '에이전트 이벤트 발생 시 자동으로 액션을 실행합니다.\n\n액션 유형: Webhook, Log, Memory Save',
  cron:
    '주기적으로 자동 실행되는 예약 작업을 관리합니다.\n\n작업 유형: 에이전트 실행, HTTP 요청, 메모리 정리, 건강 체크',
};

export default function AutomationTab() {
  return (
    <div className="space-y-8">
      {/* Event Hooks */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-foreground">이벤트 훅</h3>
          <HelpTooltip text={HELP.hooks} />
        </div>
        <EventHookEditor />
      </section>

      <hr className="border-border" />

      {/* Cron Jobs */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-foreground">예약 작업</h3>
          <HelpTooltip text={HELP.cron} />
        </div>
        <CronJobEditor />
      </section>
    </div>
  );
}
