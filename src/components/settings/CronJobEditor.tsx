'use client';

import { useState, useEffect, useCallback } from 'react';
import CronExpressionInput, { describeCron } from './CronExpressionInput';
import type {
  CronJob,
  CronJobType,
  AgentRunConfig,
  HttpRequestConfig,
  MemoryCleanupConfig,
  HealthCheckConfig,
} from '@/types/cron';

const JOB_TYPE_LABELS: Record<CronJobType, string> = {
  agent_run: '에이전트 실행',
  http_request: 'HTTP 요청',
  memory_cleanup: '메모리 정리',
  health_check: '건강 체크',
};

function formatTime(ts?: number): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('ko-KR');
}

function getDefaultConfig(jobType: CronJobType): AgentRunConfig | HttpRequestConfig | MemoryCleanupConfig | HealthCheckConfig {
  switch (jobType) {
    case 'agent_run':
      return { prompt: '' };
    case 'http_request':
      return { url: '', method: 'GET' };
    case 'memory_cleanup':
      return { maxAgeDays: 30, maxCount: 1000 };
    case 'health_check':
      return {};
  }
}

const inputClass =
  'w-full bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent';
const selectClass =
  'w-full bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent appearance-none cursor-pointer';

export default function CronJobEditor() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [schedulerRunning, setSchedulerRunning] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cronExpression, setCronExpression] = useState('*/5 * * * *');
  const [jobType, setJobType] = useState<CronJobType>('agent_run');
  const [jobConfig, setJobConfig] = useState<AgentRunConfig | HttpRequestConfig | MemoryCleanupConfig | HealthCheckConfig>(
    getDefaultConfig('agent_run')
  );

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/cron');
      if (res.ok) {
        const data = await res.json();
        setJobs(data);
      }
    } catch (e) {
      console.error('Failed to fetch cron jobs:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/cron/status');
      if (res.ok) {
        const data = await res.json();
        setSchedulerRunning(data.running);
      }
    } catch (e) {
      console.error('Failed to fetch scheduler status:', e);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    fetchStatus();
  }, [fetchJobs, fetchStatus]);

  const toggleScheduler = async () => {
    try {
      const action = schedulerRunning ? 'stop' : 'start';
      const res = await fetch('/api/cron/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setSchedulerRunning(!schedulerRunning);
      }
    } catch (e) {
      console.error('Failed to toggle scheduler:', e);
    }
  };

  const toggleJob = async (job: CronJob) => {
    try {
      const res = await fetch(`/api/cron/${job.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !job.enabled }),
      });
      if (res.ok) {
        setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, enabled: !j.enabled } : j)));
      }
    } catch (e) {
      console.error('Failed to toggle job:', e);
    }
  };

  const deleteJob = async (id: string) => {
    try {
      const res = await fetch(`/api/cron/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setJobs((prev) => prev.filter((j) => j.id !== id));
      }
    } catch (e) {
      console.error('Failed to delete job:', e);
    }
  };

  const runJob = async (id: string) => {
    setRunningJobId(id);
    try {
      await fetch(`/api/cron/${id}/run`, { method: 'POST' });
      await fetchJobs();
    } catch (e) {
      console.error('Failed to run job:', e);
    } finally {
      setRunningJobId(null);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !cronExpression.trim()) return;
    try {
      const res = await fetch('/api/cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, cronExpression, jobType, jobConfig }),
      });
      if (res.ok) {
        setName('');
        setDescription('');
        setCronExpression('*/5 * * * *');
        setJobType('agent_run');
        setJobConfig(getDefaultConfig('agent_run'));
        setShowForm(false);
        await fetchJobs();
      }
    } catch (e) {
      console.error('Failed to create job:', e);
    }
  };

  const handleJobTypeChange = (newType: CronJobType) => {
    setJobType(newType);
    setJobConfig(getDefaultConfig(newType));
  };

  const updateConfig = (key: string, value: string | number) => {
    setJobConfig((prev) => ({ ...prev, [key]: value }));
  };

  const renderConfigForm = () => {
    switch (jobType) {
      case 'agent_run': {
        const config = jobConfig as AgentRunConfig;
        return (
          <div className="space-y-2">
            <div>
              <label className="text-xs text-muted mb-1 block">프롬프트 *</label>
              <textarea
                value={config.prompt || ''}
                onChange={(e) => updateConfig('prompt', e.target.value)}
                className={inputClass + ' min-h-[60px] resize-y'}
                placeholder="에이전트에게 전달할 프롬프트"
              />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">모델 (선택)</label>
              <input
                type="text"
                value={config.model || ''}
                onChange={(e) => updateConfig('model', e.target.value)}
                className={inputClass}
                placeholder="예: llama3"
              />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">시스템 프롬프트 (선택)</label>
              <textarea
                value={config.systemPrompt || ''}
                onChange={(e) => updateConfig('systemPrompt', e.target.value)}
                className={inputClass + ' min-h-[60px] resize-y'}
                placeholder="시스템 프롬프트"
              />
            </div>
          </div>
        );
      }
      case 'http_request': {
        const config = jobConfig as HttpRequestConfig;
        return (
          <div className="space-y-2">
            <div>
              <label className="text-xs text-muted mb-1 block">URL *</label>
              <input
                type="text"
                value={config.url || ''}
                onChange={(e) => updateConfig('url', e.target.value)}
                className={inputClass}
                placeholder="https://example.com/api"
              />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">메서드</label>
              <select
                value={config.method || 'GET'}
                onChange={(e) => updateConfig('method', e.target.value)}
                className={selectClass}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Body (선택)</label>
              <textarea
                value={config.body || ''}
                onChange={(e) => updateConfig('body', e.target.value)}
                className={inputClass + ' min-h-[60px] resize-y'}
                placeholder='{"key": "value"}'
              />
            </div>
          </div>
        );
      }
      case 'memory_cleanup': {
        const config = jobConfig as MemoryCleanupConfig;
        return (
          <div className="space-y-2">
            <div>
              <label className="text-xs text-muted mb-1 block">최대 보관 일수</label>
              <input
                type="number"
                value={config.maxAgeDays ?? 30}
                onChange={(e) => updateConfig('maxAgeDays', parseInt(e.target.value) || 0)}
                className={inputClass}
                min={1}
              />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">최대 보관 수</label>
              <input
                type="number"
                value={config.maxCount ?? 1000}
                onChange={(e) => updateConfig('maxCount', parseInt(e.target.value) || 0)}
                className={inputClass}
                min={1}
              />
            </div>
          </div>
        );
      }
      case 'health_check': {
        const config = jobConfig as HealthCheckConfig;
        return (
          <div className="space-y-2">
            <div>
              <label className="text-xs text-muted mb-1 block">알림 URL (선택)</label>
              <input
                type="text"
                value={config.notifyUrl || ''}
                onChange={(e) => updateConfig('notifyUrl', e.target.value)}
                className={inputClass}
                placeholder="https://hooks.slack.com/..."
              />
            </div>
          </div>
        );
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Scheduler status */}
      <div className="flex items-center justify-between p-3 bg-card border border-border rounded-lg">
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${schedulerRunning ? 'bg-green-500' : 'bg-gray-400'}`}
          />
          <span className="text-sm font-medium">
            스케줄러 {schedulerRunning ? '실행 중' : '정지됨'}
          </span>
        </div>
        <button
          onClick={toggleScheduler}
          className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
            schedulerRunning
              ? 'border-red-500/30 text-red-400 hover:bg-red-500/10'
              : 'border-green-500/30 text-green-400 hover:bg-green-500/10'
          }`}
        >
          {schedulerRunning ? '정지' : '시작'}
        </button>
      </div>

      {/* Job list */}
      {loading ? (
        <p className="text-sm text-muted text-center py-4">로딩 중...</p>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-muted text-center py-4">등록된 작업이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="p-3 bg-card border border-border rounded-lg space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium truncate">{job.name}</span>
                  <span className="text-xs text-muted px-1.5 py-0.5 bg-background rounded">
                    {JOB_TYPE_LABELS[job.jobType]}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* Toggle */}
                  <button
                    onClick={() => toggleJob(job)}
                    className={`relative w-8 h-4 rounded-full transition-colors ${
                      job.enabled ? 'bg-accent' : 'bg-gray-500'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                        job.enabled ? 'left-4' : 'left-0.5'
                      }`}
                    />
                  </button>
                  {/* Run now */}
                  <button
                    onClick={() => runJob(job.id)}
                    disabled={runningJobId === job.id}
                    className="text-xs text-accent hover:text-accent-hover disabled:opacity-50"
                  >
                    {runningJobId === job.id ? (
                      <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    ) : (
                      '즉시 실행'
                    )}
                  </button>
                  {/* Delete */}
                  <button
                    onClick={() => deleteJob(job.id)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    삭제
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span>{describeCron(job.cronExpression)} ({job.cronExpression})</span>
                <span>실행 {job.runCount}회</span>
                <span>최근: {formatTime(job.lastRunAt)}</span>
                <span>다음: {formatTime(job.nextRunAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add form toggle */}
      <div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs text-accent hover:text-accent-hover"
        >
          {showForm ? '- 닫기' : '+ 새 작업 추가'}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="p-3 bg-card border border-border rounded-lg space-y-3">
          <div>
            <label className="text-xs text-muted mb-1 block">이름 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="작업 이름"
            />
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">설명</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClass}
              placeholder="작업 설명 (선택)"
            />
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">크론 표현식 *</label>
            <CronExpressionInput value={cronExpression} onChange={setCronExpression} />
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">작업 유형</label>
            <select
              value={jobType}
              onChange={(e) => handleJobTypeChange(e.target.value as CronJobType)}
              className={selectClass}
            >
              {(Object.keys(JOB_TYPE_LABELS) as CronJobType[]).map((type) => (
                <option key={type} value={type}>
                  {JOB_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">작업 설정</label>
            {renderConfigForm()}
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted hover:text-foreground"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim() || !cronExpression.trim()}
              className="text-xs px-3 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
            >
              저장
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
