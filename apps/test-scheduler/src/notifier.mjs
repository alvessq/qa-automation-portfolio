// Avisos da triagem. Os dois canais são opcionais:
//   - GitHub Issues (GITHUB_REPOSITORY + GITHUB_TOKEN): só bug confirmado vira
//     issue; se já existe uma aberta para a mesma falha, entra um comentário.
//   - Webhook (TRIAGE_WEBHOOK_URL): aviso curto para qualquer veredito.
// Sem configuração, o veredito fica só no painel.

export const ISSUE_LABEL = 'triagem';
const OUTPUT_TAIL_CHARS = 3000;

const KIND_TEXT = {
  bug: { emoji: '🔴', title: 'Bug confirmado', detail: 'falhou em todas as repetições' },
  flaky: { emoji: '🟡', title: 'Falha passageira', detail: 'passou em uma repetição; nenhuma issue aberta' },
  environment: { emoji: '⚪', title: 'Problema de ambiente', detail: 'o ambiente de teste caiu; nenhuma issue aberta' },
};

export function describeVerdict(verdict) {
  const kind = KIND_TEXT[verdict.kind];
  const tries = verdict.attempts.length ? ` (${verdict.attempts.length} repetição(ões))` : '';
  return `${kind.emoji} ${kind.title}: ${verdict.jobName}${tries}. ${kind.detail}.`;
}

export function issueTitle(verdict) {
  return `[triagem] ${verdict.jobName}: ${verdict.signature}`.slice(0, 200);
}

export function issueBody(verdict, output = '') {
  const attempts = verdict.attempts.map((a, i) => `| ${i + 1} | ${a.status} | \`${a.runId}\` |`).join('\n');
  const tail = output.slice(-OUTPUT_TAIL_CHARS).replace(/```/g, "'''");
  return [
    `O job **${verdict.jobName}** falhou e continuou falhando em todas as repetições da triagem.`,
    '',
    `- Execução original: \`${verdict.origin.runId}\` (${verdict.origin.status})`,
    `- Primeira linha de erro: \`${verdict.signature}\``,
    '',
    '| Repetição | Resultado | Execução |',
    '|---|---|---|',
    attempts,
    '',
    '<details><summary>Final da saída</summary>',
    '',
    '```',
    tail,
    '```',
    '',
    '</details>',
    '',
    `<!-- triagem:fingerprint=${verdict.fingerprint} -->`,
  ].join('\n');
}

export function createNotifier({ repository, token, webhookUrl, fetchImpl = fetch, log = console.log } = {}) {
  const github = Boolean(repository && token);
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'qa-automation-portfolio-scheduler',
  };

  async function gh(method, path, body) {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}${path}`, {
      method,
      headers: body ? { ...headers, 'Content-Type': 'application/json' } : headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(`GitHub ${method} ${path}: HTTP ${response.status}`);
    return response.json();
  }

  async function openOrCommentIssue(verdict, output) {
    const marker = `triagem:fingerprint=${verdict.fingerprint}`;
    const open = await gh('GET', `/issues?state=open&labels=${ISSUE_LABEL}&per_page=100`);
    const existing = open.find((issue) => !issue.pull_request && issue.body?.includes(marker));
    if (existing) {
      await gh('POST', `/issues/${existing.number}/comments`, {
        body: `A mesma falha voltou a acontecer e foi confirmada de novo pela triagem.\n\n${describeVerdict(verdict)}`,
      });
      return { url: existing.html_url, number: existing.number, reused: true };
    }
    const created = await gh('POST', '/issues', {
      title: issueTitle(verdict),
      body: issueBody(verdict, output),
      labels: [ISSUE_LABEL, 'bug'],
    });
    return { url: created.html_url, number: created.number, reused: false };
  }

  async function sendWebhook(text) {
    // `text` atende Slack e Teams; `content` atende Discord.
    const response = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, content: text }),
    });
    if (!response.ok) throw new Error(`webhook: HTTP ${response.status}`);
  }

  return {
    channels: { github, webhook: Boolean(webhookUrl) },

    /** Nunca lança: um canal fora do ar não pode derrubar o agendador. */
    async notify(verdict, output) {
      const result = { issue: null, webhook: false, errors: [] };
      if (github && verdict.kind === 'bug') {
        try {
          result.issue = await openOrCommentIssue(verdict, output);
        } catch (error) {
          result.errors.push(error.message);
        }
      }
      if (webhookUrl) {
        const link = result.issue ? ` ${result.issue.url}` : '';
        try {
          await sendWebhook(`${describeVerdict(verdict)}${link}`);
          result.webhook = true;
        } catch (error) {
          result.errors.push(error.message);
        }
      }
      for (const message of result.errors) log(`[triagem] aviso não enviado: ${message}`);
      return result;
    },
  };
}
