import { AgentConfig, AgentEvent } from '@/lib/agent/types';
import { AgentSkill } from '@/types/skills';
import { runAgentLoop } from '@/lib/agent/agent-loop';

export async function* runSkill(
  baseConfig: AgentConfig,
  skill: AgentSkill,
  userMessage: string,
  history: { role: string; content: string }[],
  memories: string[]
): AsyncGenerator<AgentEvent> {
  yield {
    type: 'skill_start',
    data: { skillId: skill.id, skillName: skill.name, totalSteps: skill.workflow.length },
  };

  const workflowInstructions = skill.workflow
    .map((step, i) => `단계 ${i + 1}: ${step.instruction}`)
    .join('\n');

  const skillSystemPrompt =
    (skill.systemPromptOverride || baseConfig.systemPrompt) +
    `\n\n## 작업 워크플로우\n다음 단계를 순서대로 수행하세요:\n${workflowInstructions}\n\n각 단계를 수행할 때 "## 단계 N:" 형식으로 시작하세요.`;

  const skillConfig: AgentConfig = {
    ...baseConfig,
    systemPrompt: skillSystemPrompt,
    enabledTools: skill.enabledTools,
    maxIterations: skill.maxIterations || baseConfig.maxIterations,
    activeSkill: skill,
  };
  if (skill.model) {
    skillConfig.ollamaModel = skill.model;
  }

  let currentStep = 0;
  for await (const event of runAgentLoop(skillConfig, userMessage, history, memories)) {
    if (event.type === 'token') {
      const content = event.data.content as string;
      const stepMatch = content.match(/## 단계 (\d+)/);
      if (stepMatch) {
        const stepNum = parseInt(stepMatch[1]);
        if (stepNum > currentStep && stepNum <= skill.workflow.length) {
          currentStep = stepNum;
          yield {
            type: 'skill_step',
            data: {
              skillId: skill.id,
              step: currentStep,
              total: skill.workflow.length,
              instruction: skill.workflow[currentStep - 1]?.instruction,
            },
          };
        }
      }
    }
    yield event;
  }

  yield {
    type: 'skill_end',
    data: { skillId: skill.id, completedSteps: currentStep },
  };
}
