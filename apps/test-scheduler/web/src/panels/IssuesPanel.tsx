import { useState } from 'react';
import { ago } from '../lib/format';
import { Notice, PanelTitle, Pill } from '../components/ui';
import type { ProductId, Triage, Verdict } from '../types';

const VERDICT: Record<Verdict['kind'], { status: string; label: string }> = {
  bug: { status: 'failed', label: 'Bug' },
  flaky: { status: 'flaky', label: 'Passageira' },
  environment: { status: 'idle', label: 'Ambiente' },
};

function note(verdict: Verdict) {
  const parts: string[] = [];
  const n = verdict.notification;
  if (n?.pending) parts.push('enviando aviso…');
  if (n?.issue?.reused) parts.push('mesma falha de antes: virou comentário na issue aberta');
  if (n?.webhook) parts.push('aviso enviado');
  if (n?.errors?.length) parts.push(`aviso falhou: ${n.errors.join('; ')}`);
  if (verdict.kind === 'bug') parts.push(verdict.signature);
  return parts.join(' · ');
}

export function IssuesPanel({ product, triage, error, reload }: { product: ProductId; triage?: Triage; error: string; reload: () => Promise<void> }) {
  const [video, setVideo] = useState<Verdict>();
  const verdicts = triage?.verdicts ?? [];
  const retries = triage?.retries ?? 3;
  const connection = triage?.connection;

  return (
    <section className="panel">
      <PanelTitle title="Issues · GitHub">
        <button className="secondary compact" onClick={() => void reload()}>
          Atualizar
        </button>
      </PanelTitle>
      {error ? <Notice bad>{error}</Notice> : null}
      <p className="mode-hint panel-hint">
        {connection?.github ? (
          <>
            Abrindo issues em <strong>{connection.repository}</strong> com a etiqueta <code>triagem</code>
            {connection.webhook ? ' e avisando pelo webhook' : ''}.{' '}
            {connection.issuesUrl ? (
              <a className="link" href={connection.issuesUrl} target="_blank" rel="noreferrer">
                Ver issues da triagem
              </a>
            ) : null}
          </>
        ) : (
          <>
            Defina <code>GITHUB_REPOSITORY</code> e <code>GITHUB_TOKEN</code> no .env do agendador para bug confirmado virar issue.
            {connection?.webhook ? ' O webhook já está configurado.' : ' Sem isso, o veredito fica só aqui no painel.'}
          </>
        )}
      </p>
      {product === 'mobile' && triage?.emulator && !triage.emulator.online ? (
        <Notice bad>Emulador desligado agora. O próximo teste tenta ligá-lo; se não ligar, o veredito é “ambiente” e nenhuma issue é aberta.</Notice>
      ) : null}
      <ol className="jira-process">
        <li>Um teste com triagem falhou: antes de avisar alguém, ele roda de novo, até {retries} vezes, na frente da fila.</li>
        <li>Falhou em todas as repetições: é <strong>bug</strong>. Abre uma issue com a primeira linha do erro e o final do log (se a mesma falha já tem issue aberta, vira comentário nela).</li>
        <li>Passou em alguma repetição: é falha <strong>passageira</strong>. Não abre issue, só avisa pelo webhook.</li>
        <li>O ambiente caiu (emulador, rede, navegador): é <strong>ambiente</strong>. Nada é aberto, porque o problema não é do sistema testado.</li>
      </ol>
      {triage?.sessions.length ? (
        <div className="local-queue">
          <strong>Reproduzindo agora:</strong>
          {triage.sessions.map((s) => (
            <span key={s.jobId}>
              {s.jobName} · {s.done}/{s.of}
            </span>
          ))}
        </div>
      ) : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Quando</th>
              <th>Teste</th>
              <th>Veredito</th>
              <th>Issue</th>
              <th>Vídeo</th>
              <th>Nota</th>
            </tr>
          </thead>
          <tbody>
            {verdicts.map((v) => (
              <tr key={v.id}>
                <td>{ago(v.decidedAt)}</td>
                <td>
                  <strong>{v.jobName}</strong>
                  <div className="meta">{v.attempts.length} repetição(ões)</div>
                </td>
                <td>
                  <Pill status={VERDICT[v.kind].status} label={VERDICT[v.kind].label} />
                </td>
                <td>
                  {v.notification?.issue ? (
                    <a className="link" href={v.notification.issue.url} target="_blank" rel="noreferrer">
                      #{v.notification.issue.number}
                    </a>
                  ) : v.kind === 'bug' ? (
                    'não aberta'
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {v.video ? (
                    <button className="secondary compact" onClick={() => setVideo(v)}>
                      Ver
                    </button>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="meta">{note(v)}</td>
              </tr>
            ))}
            {!verdicts.length ? (
              <tr>
                <td colSpan={6}>Nenhum veredito ainda. Só testes com triagem ligada entram neste fluxo.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {video?.video ? (
        <div className="log-modal media-modal" role="dialog" aria-modal="true" aria-label={video.jobName}>
          <div className="panel-title">
            <h3>{video.jobName}</h3>
            <button className="secondary compact" onClick={() => setVideo(undefined)}>
              Fechar
            </button>
          </div>
          <div className="media-grid single">
            <video controls src={`/api/videos/${encodeURIComponent(video.video)}`} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
