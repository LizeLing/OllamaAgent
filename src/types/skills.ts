export interface SkillStep {
  id: string;
  instruction: string;
  requiredTools?: string[];
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  icon?: string;
  triggerCommand?: string;
  systemPromptOverride?: string;
  enabledTools: string[];
  model?: string;
  maxIterations?: number;
  workflow: SkillStep[];
  isBuiltin: boolean;
}
