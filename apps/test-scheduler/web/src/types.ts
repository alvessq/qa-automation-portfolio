export type ProductId = 'mobile' | 'web';
export type Kind = 'health' | 'suite' | 'test';

export type Window = { from: string; to: string } | null;

export type LastRun = {
  runId: string;
  status: string;
  trigger?: string;
  startedAt?: string;
  finishedAt?: string | null;
  durationMs?: number | null;
  video?: string | null;
};

export type Job = {
  id: string;
  name: string;
  workspace: string;
  script: string;
  intervalMinutes: number;
  window: Window;
  timeoutMinutes: number;
  enabled: boolean;
  triage: boolean;
};

export type JobView = Job & {
  product: ProductId;
  kind: Kind;
  hint: string | null;
  status: string;
  queuePosition: number | null;
  lastRun: LastRun | null;
  nextRunAt: string | null;
  replay: { done: number; of: number } | null;
};

export type QueueItem = { jobId: string; trigger: string; queuedAt: string; position: number; name: string; kind: Kind; product: ProductId | null };

export type Device = { online: boolean; serials: string[]; reason: string | null };
export type Prepare = { status: 'idle' | 'running' | 'ready' | 'failed'; startedAt: string | null; finishedAt: string | null; output: string };

export type Status = {
  serverTime: string;
  paused: boolean;
  tests: JobView[];
  queue: QueueItem[];
  emulator?: Device;
  prepare?: Prepare;
};

export type Preset = Job & { kind: Kind };
export type SpecOption = { id: string; name: string };
export type Suites = { smoke: string[]; regression: string[] };
export type Catalog = { presets: Preset[]; scripts: string[]; specs?: SpecOption[]; suites?: Suites };

export type HistoryItem = {
  runId: string;
  jobId: string;
  jobName: string;
  trigger: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  exitCode: number | null;
  video?: string | null;
  product: ProductId | null;
  kind: Kind;
};

export type VideoItem = { name: string; jobId: string; size: number; modifiedAt: string };

export type Verdict = {
  id: string;
  jobId: string;
  jobName: string;
  kind: 'bug' | 'flaky' | 'environment';
  attempts: Array<{ runId: string; status: string }>;
  signature: string;
  decidedAt: string;
  video?: string | null;
  notification?: { pending?: boolean; issue?: { url: string; number: number; reused: boolean } | null; webhook?: boolean; errors?: string[] };
};

export type Triage = {
  connection: { github: boolean; webhook: boolean; repository: string | null; issuesUrl: string | null };
  retries: number;
  emulator?: Device;
  sessions: Array<{ jobId: string; jobName: string; done: number; of: number }>;
  verdicts: Verdict[];
};

export type CloudRun = {
  id: number;
  runNumber: number;
  name: string;
  target: string | null;
  event: string;
  status: string;
  conclusion: string | null;
  createdAt: string;
  runStartedAt?: string;
  updatedAt?: string;
  url: string;
};

export type GithubConfigured = { read: boolean; dispatch: boolean };
export type CloudRuns = { configured: GithubConfigured; runs: CloudRun[]; error?: string };

export type CloudJob = {
  id: string;
  name: string;
  cron: string;
  enabled: boolean;
  order: number;
  workflow: string;
  inputs: { suite?: string; specName?: string };
};

export type CloudSchedule = {
  configured: GithubConfigured;
  paused: boolean;
  timeZone: string;
  jobs: CloudJob[];
  queue: Array<{ id: string; jobId: string; trigger: string; queuedAt: string }>;
  history: Array<{ id: string; jobId: string; jobName: string; trigger: string; at: string; status: 'dispatched' | 'failed'; error?: string }>;
};

export type ConfigItem = { workspace: string; names: string[]; anyOf: boolean; kind: 'default' | 'feature' | 'required'; status: 'ok' | 'partial' | 'missing'; impact: string | null };

export type Overview = {
  paused: boolean;
  timeZone: string;
  github: GithubConfigured;
  config: ConfigItem[];
  products: Array<{ id: ProductId; name: string; status: string; summary: { total: number; passed: number; failed: number }; running: number; generatedAt: string | null }>;
};

export type Media = { name: string; type: string; size: number };
