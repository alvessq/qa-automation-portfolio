# QA Automation Portfolio

[![CI](https://github.com/alvessq/qa-automation-portfolio/actions/workflows/ci.yml/badge.svg)](https://github.com/alvessq/qa-automation-portfolio/actions/workflows/ci.yml)
[![Mobile E2E](https://github.com/alvessq/qa-automation-portfolio/actions/workflows/mobile-e2e.yml/badge.svg)](https://github.com/alvessq/qa-automation-portfolio/actions/workflows/mobile-e2e.yml)
[![Web Monitoring](https://github.com/alvessq/qa-automation-portfolio/actions/workflows/web-monitoring.yml/badge.svg)](https://github.com/alvessq/qa-automation-portfolio/actions/workflows/web-monitoring.yml)

Monorepo de automação de testes com três frentes:

| Workspace | Stack | O que faz |
|---|---|---|
| [`apps/mobile-e2e`](apps/mobile-e2e) | Appium 3 + WebdriverIO 9 + TypeScript | E2E do app Android **[Sauce Labs My Demo App](https://github.com/saucelabs/my-demo-app-android)** |
| [`apps/web-e2e`](apps/web-e2e) | Playwright + TypeScript | E2E web do **[Sauce Demo](https://www.saucedemo.com)** e health check |
| [`apps/test-scheduler`](apps/test-scheduler) | Node.js + Express + node-cron | Agenda as suítes, mantém fila e histórico, e expõe um painel web |

Os dois alvos são aplicações públicas mantidas pela Sauce Labs justamente para prática de automação.

<p align="center">
  <img src="docs/images/my-demo-app-catalog.png" alt="Catálogo do My Demo App no emulador" height="420">
  &nbsp;
  <img src="docs/images/scheduler-dashboard.png" alt="Painel do Test Scheduler" height="420">
</p>

---

## Destaques

- **Page Object Model** nos dois projetos E2E, com uma classe base que concentra esperas, preenchimento e a estratégia de seletores.
- **Testes independentes:** cada cenário mobile começa com o app limpo (`mobile: clearApp`), e cada cenário web usa um contexto novo do navegador com a sessão reaproveitada via `storageState`.
- **Massa de dados por factory:** os dados são válidos por padrão, e cada teste sobrescreve só o que importa para o cenário. Credenciais podem vir de `.env` ou de secrets.
- **Evidências automáticas em falhas:** screenshot, XML da tela e vídeo (mobile), além de trace, vídeo e screenshot (web).
- **Relatórios:** spec/list no console, JUnit XML, relatório HTML do Playwright, `summary.json` e resumo em Markdown na página da execução do GitHub Actions.
- **Diagnóstico de ambiente** (`doctor`) antes da suíte mobile. Ele confere JDK, SDK, `adb`, device, APK e driver, e falha cedo com uma mensagem clara.
- **CI no GitHub Actions** com emulador Android acelerado por KVM, cache de AVD e de driver, monitoramento agendado e artifacts com as evidências.
- **Agendador** com janela de horário por job (inclusive janelas que atravessam a meia-noite), fila serial e uma lista fechada de scripts permitidos. A API nunca executa comandos livres.
- **Triagem de falhas:** um job que falha é repetido antes de qualquer aviso. Falhou em todas as repetições: bug, com issue no GitHub (sem duplicar). Passou em alguma: falha passageira. O ambiente caiu: problema de ambiente, sem issue.
- **2 bugs reais encontrados** no app de demonstração ([veja abaixo](#bugs-encontrados)).

## Estrutura

```
.
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                 # typecheck + unitários + web E2E em push/PR
│   │   ├── mobile-e2e.yml         # Android no emulador (manual, push e semanal)
│   │   └── web-monitoring.yml     # health + smoke agendados
│   └── scripts/run-mobile-suite.sh
├── apps/
│   ├── mobile-e2e/
│   │   ├── wdio.conf.ts           # capabilities, hooks de evidência, reporters
│   │   ├── suites.json            # smoke / regression -> lista de specs
│   │   ├── scripts/               # doctor, download do APK, driver Appium, runner de suíte
│   │   └── test/
│   │       ├── config/            # leitura de .env e constantes
│   │       ├── data/              # usuários, produtos, factories de checkout
│   │       ├── helpers/           # reset do app, fluxos reutilizáveis, diálogos do sistema
│   │       ├── pages/             # Page Objects (+ checkout/)
│   │       ├── reporting/         # evidências e resumo da execução
│   │       └── specs/             # um arquivo por funcionalidade
│   ├── web-e2e/
│   │   ├── playwright.config.ts   # projetos setup/autenticado/convidado
│   │   ├── scripts/health.mjs
│   │   ├── src/{config,data,fixtures,helpers,pages}/
│   │   └── tests/
│   └── test-scheduler/
│       ├── config.json            # jobs versionados
│       ├── src/                   # servidor, fila, regras de janela, validação
│       ├── public/                # painel web
│       └── test/                  # testes unitários (node:test)
└── docs/
    └── casos-de-teste.md
```

## Pré-requisitos

| Para | Precisa de |
|---|---|
| Tudo | Node.js 20.11+ (a CI usa 22, veja `.nvmrc`) |
| Mobile | JDK 17, Android SDK com `ANDROID_HOME` definido, `platform-tools` no `PATH` e um emulador ou celular com depuração USB |
| Web | Nada além do Node. O Chromium é instalado pelo Playwright |

## Como rodar

```bash
npm install
```

### Mobile (Appium)

```bash
npm run mobile:setup          # instala o driver UiAutomator2 e baixa o APK público
# inicie um emulador (Android Studio > Device Manager) ou conecte um celular
npm run mobile:doctor         # confere o ambiente
npm run test:mobile:smoke     # catálogo + login
npm run test:mobile:regression
npm run test:mobile           # todas as specs
```

O WebdriverIO sobe o servidor Appium sozinho, na porta 4723. Para rodar uma spec isolada:

```bash
npm run test:spec -w mobile-e2e -- ./test/specs/checkout.spec.ts
```

Evidências ficam em `apps/mobile-e2e/test-results/`: `junit/`, `screenshots/`, `videos/`, `page-source/`, `logs/` e `summary.json`.

### Web (Playwright)

```bash
npm run browsers:install -w web-e2e   # primeira vez
npm run test:web                       # suíte completa
npm run test:web:smoke                 # apenas @smoke
npm run health:web                     # health check do site
npm run report:web                     # abre o relatório HTML
```

### Agendador

```bash
npm run scheduler                      # http://127.0.0.1:7400
```

Os jobs ficam em [`apps/test-scheduler/config.json`](apps/test-scheduler/config.json). Cada job aponta para um script npm de um workspace de teste e define intervalo, janela de horário e timeout. Pelo painel dá para ativar ou desativar jobs, executar na hora, parar, acompanhar a fila e ler o log de cada execução.

#### Triagem de falhas

Teste E2E às vezes falha por instabilidade e não por defeito. Para não transformar cada falha em alarme, os jobs com `"triage": true` passam por uma triagem antes de qualquer aviso:

```
job falha ──► repete até 3 vezes (na frente da fila)
               ├─ falhou em todas ......... bug confirmado ─► issue no GitHub + webhook
               ├─ passou em alguma ........ falha passageira ─► só webhook
               └─ saída de ambiente caído . problema de ambiente ─► só webhook
```

- **Problema de ambiente** é reconhecido pela saída: device offline, sessão do Appium recusada, DNS ou rede fora, navegador não instalado ([`triage.mjs`](apps/test-scheduler/src/triage.mjs)). Nesses casos o job nem é repetido.
- **Sem issue duplicada:** cada falha ganha uma impressão digital (job + primeira linha de erro, sem números). Se já existe issue aberta com a mesma impressão, a triagem comenta nela em vez de abrir outra.
- **Avisos opcionais:** com `GITHUB_REPOSITORY` e `GITHUB_TOKEN`, bug confirmado vira issue com o rótulo `triagem`. Com `TRIAGE_WEBHOOK_URL`, todo veredito gera um aviso curto (Slack, Teams ou Discord). Sem nada configurado, os vereditos aparecem só no painel.
- O health check fica de fora (`"triage": false`): ele existe justamente para avisar rápido.

## Configuração

Cada workspace tem um `.env.example`. Copie para `.env` só se quiser sobrescrever os padrões. O `.env` nunca é versionado.

| Variável | Workspace | Padrão |
|---|---|---|
| `ANDROID_UDID` | mobile | primeiro device online |
| `ANDROID_PLATFORM_VERSION` | mobile | versão do device |
| `APP_PATH` | mobile | `./apps/my-demo-app.apk` |
| `MDA_RELEASE_TAG` | mobile | último release |
| `RECORD_VIDEO` / `VIDEOS_TO_KEEP` | mobile | `true` / `5` |
| `BASE_URL` | web | `https://www.saucedemo.com` |
| `SAUCE_STANDARD_USER` / `SAUCE_PASSWORD` | web | credenciais públicas do site |
| `HOST` / `PORT` | scheduler | `127.0.0.1` / `7400` |
| `SCHEDULER_TZ` | scheduler | `America/Sao_Paulo` |
| `START_PAUSED` | scheduler | `false` |
| `TRIAGE_RETRIES` | scheduler | `3` |
| `GITHUB_REPOSITORY` / `GITHUB_TOKEN` | scheduler | vazio (sem issues) |
| `TRIAGE_WEBHOOK_URL` | scheduler | vazio (sem webhook) |

## Cenários cobertos

**Mobile: 18 testes em 6 specs**

| Spec | Cenários |
|---|---|
| `catalog` | catálogo carregado com carrinho vazio, ordenação por nome (A–Z e Z–A) e por preço (crescente e decrescente) |
| `login` | login válido, usuário bloqueado, usuário obrigatório, senha obrigatória |
| `product-details` | nome e preço, ajuste de quantidade, badge do carrinho |
| `cart` | soma de vários produtos, recálculo ao mudar a quantidade, remoção até o carrinho ficar vazio |
| `checkout` | compra de ponta a ponta (endereço, pagamento, revisão, confirmação), validação dos campos obrigatórios |
| `logout` | encerramento da sessão com confirmação nativa do Android |

**Web: 19 testes + setup de autenticação**

| Spec | Cenários |
|---|---|
| `login` | login válido `@smoke`, bloqueado, senha errada, campos obrigatórios, acesso direto sem sessão |
| `inventory` | listagem `@smoke`, três ordenações, detalhe do produto, logout |
| `cart` | adicionar e ver o badge `@smoke`, remover, continuar comprando |
| `checkout` | compra completa com conferência de subtotal, imposto e total `@smoke`, três validações de campo |

O detalhamento de cada cenário está em [`docs/casos-de-teste.md`](docs/casos-de-teste.md).

## CI/CD

| Workflow | Quando roda | O que faz |
|---|---|---|
| **CI** | push na `main`, pull requests, manual | typecheck, testes unitários do agendador, health check e suíte web completa |
| **Mobile E2E** | manual (escolhe `smoke`, `regression` ou uma spec), push em `apps/mobile-e2e/**`, toda segunda-feira | sobe o emulador Android API 34 com KVM, baixa o APK, roda a suíte e publica evidências e logcat |
| **Web Monitoring** | 3 vezes por dia em dias úteis, manual | health check e smoke, como monitoramento sintético |

Cada execução publica artifacts com relatórios e evidências por 14 dias. A suíte mobile também escreve uma tabela de resultados no resumo da execução.

## Bugs encontrados

Durante a automação apareceram dois defeitos no **My Demo App Android 2.3.0**:

1. **O app fecha ao abrir produtos abaixo da 6ª posição do catálogo.**
   `java.lang.ArrayIndexOutOfBoundsException: length=6; index=12` em `ProductCatalogFragment.java:156`. O catálogo lista as variações de cor de cada produto, mas o clique indexa uma lista que só tem os 6 produtos base.
   *Contorno nos testes:* cada produto da massa declara a ordenação que o coloca no topo (`listedFirstBy`), e os cenários só abrem produtos que estão nessa posição.

2. **O badge do carrinho no catálogo não se atualiza ao voltar da tela de produto.**
   Depois de adicionar itens e voltar, o catálogo mostra o carrinho vazio, embora os itens estejam no carrinho. O badge só fica correto depois de navegar para outra tela.
   *Contorno nos testes:* a contagem é conferida na tela do carrinho, onde o badge é renderizado corretamente.

## Decisões técnicas

- **Seletores mobile:** a ordem de preferência é `resource-id`, depois accessibility id (`content-desc`) e, por último, texto. Os dois primeiros não dependem do idioma nem da cópia do app.
- **Isolamento sem reinstalar:** o `mobile: clearApp` zera os dados do app em cerca de 1 segundo. Reinstalar o APK a cada teste levaria vários.
- **Uma suíte por vez no agendador:** o emulador não suporta sessões concorrentes, e rodar em série evita falsos negativos por disputa de recursos.
- **Agendador seguro por padrão:** ele escuta só em `127.0.0.1`. Jobs só referenciam scripts que existem no `package.json` dos workspaces permitidos, e qualquer outro valor é recusado com HTTP 400.
- **Retry só na CI:** localmente, uma falha aparece na primeira vez. Na CI, uma nova tentativa absorve a instabilidade do emulador sem GPU.

## Licença

[MIT](LICENSE)
