import { useEffect, useState } from 'react';
import { attempt, send, usePolling } from '../lib/api';
import { isScheduleLive, tone } from '../lib/format';
import { Metrics, Notice, type Metric } from '../components/ui';
import { HealthPanel } from '../panels/HealthPanel';
import { LocalTestsPanel } from '../panels/LocalTestsPanel';
import { HistoryPanel } from '../panels/HistoryPanel';
import { IssuesPanel } from '../panels/IssuesPanel';
import { CloudTestsPanel } from '../panels/CloudTestsPanel';
import { CloudSchedulePanel } from '../panels/CloudSchedulePanel';
import { CloudHistoryPanel } from '../panels/CloudHistoryPanel';
import { cloudTests, runStatus, targetOfInputs, WORKFLOW } from '../panels/cloud';
import { Page } from './Page';
import type { Catalog, CloudRuns, CloudSchedule, ProductId, Status, Triage } from '../types';

type Mode = 'local' | 'github' | 'issues';

const PRODUCTS: Record<ProductId, { title: string; eyebrow: string; description: string; modes: Mode[]; hints: Partial<Record<Mode, string>> }> = {
  mobile: {
    title: 'Mobile',
    eyebrow: 'APP ANDROID · APPIUM',
    description: 'Execução, agenda e evidências dos testes do My Demo App.',
    modes: ['local', 'github', 'issues'],
    hints: {
      local:
        'Os health checks conferem celular, APK e driver do Appium. Os testes usam o emulador desta máquina: se ele estiver desligado, o painel baixa o APK mais novo e liga o emulador antes. Teste que falha roda de novo até 3 vezes antes de virar issue.',
      github:
        'Dispara os testes no emulador do GitHub Actions, sem depender desta máquina. Status, logs, screenshots e vídeos vêm das próprias execuções.',
      issues: 'O que a triagem decidiu sobre cada falha local: bug vira issue com o log, falha passageira só avisa e ambiente fora do ar não abre nada.',
    },
  },
  web: {
    title: 'Web',
    eyebrow: 'SITE · PLAYWRIGHT',
    description: 'Execução, agenda e evidências dos testes do Sauce Demo.',
    modes: ['local', 'issues'],
    hints: {
      local:
        'Os health checks conferem página, aplicativo, estilos, catálogo e imagens do site, cada um separado. Os testes rodam no Chromium desta máquina e guardam vídeo quando falham.',
      issues: 'O que a triagem decidiu sobre cada falha: bug vira issue com o log, falha passageira só avisa e ambiente fora do ar não abre nada.',
    },
  },
};

const MODE_LABEL: Record<Mode, string> = { local: 'Local', github: 'GitHub', issues: 'Issues' };

function storedMode(product: ProductId): Mode {
  try {
    const saved = window.localStorage.getItem(`painel-${product}-modo`) as Mode | null;
    return saved && PRODUCTS[product].modes.includes(saved) ? saved : 'local';
  } catch {
    return 'local';
  }
}

export function ProductPage({ product }: { product: ProductId }) {
  const config = PRODUCTS[product];
  const [mode, setMode] = useState<Mode>(() => storedMode(product));
  const status = usePolling<Status>(`/api/status?product=${product}`, mode === 'local' ? 3000 : 0);
  const catalog = usePolling<Catalog>(`/api/catalog?product=${product}`, 15000);
  const cloudRuns = usePolling<CloudRuns>(config.modes.includes('github') ? `/api/cloud/runs?workflow=${WORKFLOW}` : null, mode === 'github' ? 10000 : 0);
  const schedule = usePolling<CloudSchedule>(config.modes.includes('github') ? '/api/cloud/schedule' : null, mode === 'github' ? 5000 : 0);
  const triage = usePolling<Triage>(`/api/triage?product=${product}`, mode === 'issues' ? 4000 : 0);
  const [prepareMessage, setPrepareMessage] = useState('');

  useEffect(() => {
    try {
      window.localStorage.setItem(`painel-${product}-modo`, mode);
    } catch {
      // Sem localStorage (janela anônima): a aba só não é lembrada.
    }
  }, [mode, product]);

  const metrics = metricsFor(mode, status.data, cloudRuns.data, schedule.data, catalog.data, triage.data);
  const emulator = status.data?.emulator;
  const prepare = status.data?.prepare;

  return (
    <Page title={config.title} eyebrow={config.eyebrow} description={config.description}>
      <div className="mode-switch" role="tablist" aria-label="Origem das execuções">
        {config.modes.map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>
      <p className="mode-hint">{config.hints[mode]}</p>
      {mode === 'local' && emulator ? (
        emulator.online ? (
          <p className="mode-hint">
            <span className="dot ok" aria-hidden="true" /> Emulador ligado: {emulator.serials.join(', ')}
          </p>
        ) : (
          <Notice bad>
            Emulador desligado agora: no próximo teste o painel tenta ligá-lo. {emulator.reason}{' '}
            <button
              className="secondary compact"
              disabled={prepare?.status === 'running'}
              onClick={async () => {
                setPrepareMessage(await attempt(() => send('POST', '/api/prepare')));
                await status.reload();
              }}
            >
              {prepare?.status === 'running' ? 'Preparando…' : 'Preparar celular agora'}
            </button>
            {prepare?.status === 'failed' ? <span className="error-detail"> A última preparação falhou: veja o log no terminal do agendador.</span> : null}
            {prepareMessage ? <span className="error-detail"> {prepareMessage}</span> : null}
          </Notice>
        )
      ) : null}
      {metrics ? <Metrics items={metrics} /> : null}
      {mode === 'local' ? (
        <>
          <HealthPanel status={status.data} error={status.error} reload={status.reload} />
          <LocalTestsPanel product={product} status={status.data} error={status.error} reload={status.reload} catalog={catalog.data} reloadCatalog={catalog.reload} />
          <HistoryPanel product={product} status={status.data} />
        </>
      ) : mode === 'github' ? (
        <>
          <CloudTestsPanel runs={cloudRuns.data} schedule={schedule.data} catalog={catalog.data} reload={async () => void (await Promise.all([cloudRuns.reload(), schedule.reload()]))} reloadCatalog={catalog.reload} />
          <CloudSchedulePanel schedule={schedule.data} catalog={catalog.data} error={schedule.error} reload={schedule.reload} />
          <CloudHistoryPanel runs={cloudRuns.data} reload={cloudRuns.reload} />
        </>
      ) : (
        <IssuesPanel product={product} triage={triage.data} error={triage.error} reload={triage.reload} />
      )}
    </Page>
  );
}

function metricsFor(mode: Mode, status?: Status, runs?: CloudRuns, schedule?: CloudSchedule, catalog?: Catalog, triage?: Triage): Metric[] | null {
  if (mode === 'local') {
    if (!status) return null;
    const tests = status.tests;
    const passed = tests.filter((t) => t.lastRun?.status === 'passed').length;
    const failed = tests.filter((t) => tone(t.lastRun?.status) === 'failed').length;
    const active = tests.filter((t) => isScheduleLive(t.enabled, t.window)).length;
    return [
      { label: 'total', value: tests.length },
      { label: 'sucessos', value: passed, tone: 'ok' },
      { label: 'falhas', value: failed, tone: failed ? 'bad' : undefined },
      { label: 'ativos', value: active },
      { label: 'pausados', value: tests.length - active },
    ];
  }
  if (mode === 'github') {
    if (!runs) return null;
    const statuses = runs.runs.map(runStatus);
    const failed = statuses.filter((s) => tone(s) === 'failed').length;
    const tests = cloudTests(catalog);
    const jobs = schedule?.jobs ?? [];
    const scheduled = tests.filter((t) => jobs.some((j) => j.enabled && targetOfInputs(j.inputs) === t.target)).length;
    return [
      { label: 'execuções', value: statuses.length },
      { label: 'sucessos', value: statuses.filter((s) => s === 'success').length, tone: 'ok' },
      { label: 'falhas', value: failed, tone: failed ? 'bad' : undefined },
      { label: 'agendados', value: scheduled },
      { label: 'sem agenda', value: tests.length - scheduled },
    ];
  }
  if (!triage) return null;
  const count = (kind: string) => triage.verdicts.filter((v) => v.kind === kind).length;
  return [
    { label: 'vereditos', value: triage.verdicts.length },
    { label: 'bugs', value: count('bug'), tone: count('bug') ? 'bad' : undefined },
    { label: 'passageiras', value: count('flaky') },
    { label: 'ambiente', value: count('environment') },
  ];
}
