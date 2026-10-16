import { ago, tone } from '../lib/format';
import { Metrics, Notice, PanelTitle, Pill } from '../components/ui';
import { Page } from './Page';
import type { Overview } from '../types';

const PRODUCT_TEXT: Record<string, { mark: string; detail: string }> = {
  mobile: { mark: 'APP', detail: 'App Android com Appium' },
  web: { mark: 'WEB', detail: 'Site com Playwright' },
};

export function Home({ overview, error, reload }: { overview?: Overview; error: string; reload: () => Promise<void> }) {
  const products = overview?.products ?? [];
  const total = products.reduce((n, p) => n + p.summary.total, 0);
  const failed = products.reduce((n, p) => n + p.summary.failed, 0);
  const running = products.reduce((n, p) => n + p.running, 0);
  const github = overview?.github;
  const pending = (overview?.config ?? []).filter((item) => item.status !== 'ok' && item.kind !== 'default');

  return (
    <Page
      title="Painel de testes"
      eyebrow="MONITORAMENTO CONTÍNUO"
      description="Execuções, agendas, falhas e evidências dos testes mobile e web num lugar só."
      actions={
        <button className="secondary" onClick={() => void reload()}>
          Atualizar
        </button>
      }
    >
      {error ? <Notice bad>Agendador indisponível: {error}</Notice> : null}
      <Metrics
        items={[
          { label: 'testes', value: total },
          { label: 'executando', value: running },
          { label: 'falhas', value: failed, tone: failed ? 'bad' : 'ok' },
          { label: 'GitHub', value: github?.dispatch ? 'Conectado' : github?.read ? 'Só leitura' : 'Local' },
        ]}
      />
      <section className="product-grid">
        {products.map((p) => (
          <a className={`product-card ${tone(p.status)}`} href={`/${p.id}`} key={p.id}>
            <div className="product-head">
              <span className="product-mark">{PRODUCT_TEXT[p.id]?.mark ?? p.id.toUpperCase()}</span>
              <Pill status={p.status} />
            </div>
            <h2>{p.name}</h2>
            <p>
              {PRODUCT_TEXT[p.id]?.detail} · {p.generatedAt ? `atualizado ${ago(p.generatedAt)}` : 'sem execução ainda'}
            </p>
            <div className="metrics">
              <strong>
                {p.summary.total}
                <small>testes</small>
              </strong>
              <strong className="ok">
                {p.summary.passed}
                <small>ok</small>
              </strong>
              <strong className={p.summary.failed ? 'bad' : ''}>
                {p.summary.failed}
                <small>falhas</small>
              </strong>
            </div>
          </a>
        ))}
      </section>
      {pending.length ? (
        <section className="panel">
          <PanelTitle title="Configuração pendente">
            <span className="meta">no .env de cada pasta; os valores nunca aparecem aqui</span>
          </PanelTitle>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Variável</th>
                  <th>Onde</th>
                  <th>Situação</th>
                  <th>Sem ela</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((item) => (
                  <tr key={item.names.join()}>
                    <td>
                      <code>{item.names.join(item.anyOf ? ' ou ' : ' + ')}</code>
                    </td>
                    <td>{item.workspace}</td>
                    <td>
                      <Pill status={item.kind === 'required' ? 'failed' : 'paused'} label={item.status === 'partial' ? 'Incompleta' : item.kind === 'required' ? 'Obrigatória' : 'Opcional'} />
                    </td>
                    <td className="meta">{item.impact}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </Page>
  );
}
