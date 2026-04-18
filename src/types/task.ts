// ---------- Task Mode 도메인 모델 ----------

export type TaskStatus = 'active' | 'blocked' | 'review' | 'done' | 'archived';

export type TaskEpicStatus = 'todo' | 'in_progress' | 'done' | 'dropped';

export type TaskItemStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'dropped';

export type TaskItemPriority = 'high' | 'medium' | 'low';

export type TaskItemSize = 'S' | 'M' | 'L';

export type TaskWorkerRole = 'main' | 'coder' | 'researcher' | 'analyst' | 'verifier' | 'planner';

export type TaskSourceType = 'prompt' | 'spec' | 'issue' | 'manual';

export type TaskRunStatus = 'running' | 'completed' | 'aborted' | 'failed';

export type WorkerResultStatus = 'completed' | 'blocked' | 'failed';

export interface TaskSource {
  type: TaskSourceType;
  ref?: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface TaskEpic {
  id: string;
  title: string;
  description: string;
  status: TaskEpicStatus;
  taskIds: string[];
}

export interface TaskItem {
  id: string;
  epicId: string;
  title: string;
  description: string;
  status: TaskItemStatus;
  priority: TaskItemPriority;
  size: TaskItemSize;
  dependsOn: string[];
  definitionOfDone: string[];
  subtasks: ChecklistItem[];
  writeScope?: string[];
  allowedTools?: string[];
  owner?: TaskWorkerRole;
  resultSummary?: string;
  blocker?: string;
}

export interface TaskDecision {
  id: string;
  createdAt: number;
  summary: string;
  rationale?: string;
  relatedTaskIds?: string[];
}

export interface TaskRecord {
  id: string;
  title: string;
  goal: string;
  mode: 'task';
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
  source?: TaskSource;
  canonicalPlan?: string;
  acceptanceCriteria: string[];
  epics: TaskEpic[];
  tasks: TaskItem[];
  decisions: TaskDecision[];
  changedFiles: string[];
  openQuestions: string[];
  latestCheckpointId?: string;
  activeRunId?: string;
}

export interface TaskRecordMeta {
  id: string;
  title: string;
  goal: string;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
  epicCount: number;
  taskCount: number;
  completedTaskCount: number;
  latestCheckpointId?: string;
  activeRunId?: string;
}

export interface TaskRun {
  id: string;
  taskId: string;
  conversationId?: string;
  startedAt: number;
  endedAt?: number;
  model: string;
  status: TaskRunStatus;
  assignedTaskIds: string[];
  summary?: string;
}

export interface TaskCheckpoint {
  id: string;
  taskId: string;
  runId?: string;
  createdAt: number;
  summary: string;
  completedTaskIds: string[];
  inProgressTaskIds: string[];
  blockedTaskIds: string[];
  changedFiles: string[];
  decisions: string[];
  openQuestions: string[];
  nextActions: string[];
  resumePrompt: string;
  markdownPath: string;
}

export interface WorkerResult {
  taskId: string;
  status: WorkerResultStatus;
  summary: string;
  completedSubtaskIds: string[];
  changedFiles: string[];
  artifacts?: string[];
  blocker?: string;
  followupSuggestions?: string[];
}

// ---------- 부트스트랩 / 캘리브레이션 ----------

export type TaskWorkloadType = 'main-agent' | 'worker-agent' | 'mixed-task-mode';

export type RuntimeConfigSource =
  | 'safe-default'
  | 'calibration-profile'
  | 'quick-probe-adjusted';

export type CalibrationProfileStatus = 'missing' | 'fresh' | 'stale';

export interface CalibrationProfile {
  id: string;
  machineFingerprint: string;
  model: string;
  numCtx: number;
  workloadType: TaskWorkloadType;
  recommendedNumParallel: number;
  recommendedMaxConcurrentSubagents: number;
  recommendedMaxLoadedModels: number;
  measuredAt: string;
  sampleSize?: number;
  notes?: string;
}

export interface CalibrationProfileQuery {
  machineFingerprint: string;
  model: string;
  numCtx: number;
  workloadType: TaskWorkloadType;
}

export interface QuickProbeOptions {
  baseUrl: string;
  model: string;
  numCtx: number;
  workloadType: TaskWorkloadType;
  candidateNumParallel: number;
  timeoutMs?: number;
}

export interface QuickProbeResult {
  ok: boolean;
  attemptedNumParallel: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  warmLoad: boolean;
  maxLoadDurationMs: number;
  reason?: string;
}

export interface EffectiveRuntimeConfig {
  model: string;
  numCtx: number;
  workloadType: TaskWorkloadType;
  effectiveNumParallel: number;
  effectiveMaxConcurrentSubagents: number;
  effectiveMaxLoadedModels: number;
  requiredDistinctModels: number;
  source: RuntimeConfigSource;
}

export interface TaskBootstrapOptions {
  model?: string;
  numCtx?: number;
  workloadType?: TaskWorkloadType;
  includeImageModel?: boolean;
}

export interface TaskBootstrapResult {
  model: string;
  numCtx: number;
  workloadType: TaskWorkloadType;
  runtime: EffectiveRuntimeConfig;
  calibration: {
    status: CalibrationProfileStatus;
    scheduleCalibration: boolean;
    machineFingerprint: string;
    profileId?: string;
    measuredAt?: string;
  };
  quickProbe: QuickProbeResult;
  serverCaps: {
    numParallel: number;
    maxLoadedModels: number;
  };
  warnings: string[];
}
