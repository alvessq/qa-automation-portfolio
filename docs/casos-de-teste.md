# Casos de teste

Legenda de prioridade: **P1**: smoke, bloqueia release · **P2**: regressão · **P3**: borda/validação

## Mobile: Sauce Labs My Demo App (Android)

Todos os cenários começam com o app limpo, aberto no catálogo e sem login.

### Catálogo (`catalog.spec.ts`)

| ID | Cenário | Resultado esperado | Prioridade |
|---|---|---|---|
| MOB-CAT-01 | Abrir o app | Título "Products", lista com produtos, carrinho sem badge | P1 |
| MOB-CAT-02 | Ordenar por nome A–Z | Primeiro item é "Sauce Labs Backpack", lista em ordem crescente | P2 |
| MOB-CAT-03 | Ordenar por nome Z–A | Lista em ordem decrescente | P2 |
| MOB-CAT-04 | Ordenar por preço crescente | Primeiro preço é o menor do catálogo (7.99), lista crescente | P2 |
| MOB-CAT-05 | Ordenar por preço decrescente | Primeiro preço é o maior do catálogo (49.99), lista decrescente | P2 |

### Login (`login.spec.ts`)

| ID | Cenário | Resultado esperado | Prioridade |
|---|---|---|---|
| MOB-LOG-01 | Login com usuário válido | Volta ao catálogo; o menu passa a mostrar "Log Out" | P1 |
| MOB-LOG-02 | Login com usuário bloqueado | "Sorry this user has been locked out." e permanece no login | P2 |
| MOB-LOG-03 | Enviar sem usuário | "Username is required" | P3 |
| MOB-LOG-04 | Enviar sem senha | "Enter Password" | P3 |

### Detalhes do produto (`product-details.spec.ts`)

| ID | Cenário | Resultado esperado | Prioridade |
|---|---|---|---|
| MOB-PRD-01 | Abrir produto | Nome e preço iguais aos do catálogo | P2 |
| MOB-PRD-02 | Aumentar e diminuir a quantidade | Contador reflete cada toque (1 → 3 → 2) | P3 |
| MOB-PRD-03 | Adicionar 2 unidades ao carrinho | Badge do carrinho mostra 2 | P2 |

### Carrinho (`cart.spec.ts`)

| ID | Cenário | Resultado esperado | Prioridade |
|---|---|---|---|
| MOB-CRT-01 | Adicionar produtos diferentes | Itens listados, "3 Items" e total igual à soma dos preços | P2 |
| MOB-CRT-02 | Aumentar a quantidade no carrinho | Contagem e total recalculados | P2 |
| MOB-CRT-03 | Remover o único item | Mensagem de carrinho vazio, badge zerado | P2 |

### Checkout (`checkout.spec.ts`)

Pré-condição: usuário logado e um produto no carrinho.

| ID | Cenário | Resultado esperado | Prioridade |
|---|---|---|---|
| MOB-CHK-01 | Compra de ponta a ponta | Endereço → pagamento → revisão com o produto → "Checkout Complete" → carrinho vazio | P1 |
| MOB-CHK-02 | Endereço sem nome, rua e cidade | Mensagem de erro em cada campo; não avança para o pagamento | P3 |

### Logout (`logout.spec.ts`)

| ID | Cenário | Resultado esperado | Prioridade |
|---|---|---|---|
| MOB-OUT-01 | Logout pelo menu | Confirmação nativa → tela de login; o menu volta a mostrar "Log In" | P2 |

---

## Web: Sauce Demo

Cenários autenticados reaproveitam a sessão criada no projeto `setup`. Os de login começam deslogados.

### Login (`login.spec.ts`)

| ID | Cenário | Resultado esperado | Prioridade |
|---|---|---|---|
| WEB-LOG-01 | Login com usuário válido | Redireciona para `/inventory.html` | P1 |
| WEB-LOG-02 | Usuário bloqueado | Mensagem de bloqueio, sem redirecionar | P2 |
| WEB-LOG-03 | Senha incorreta | "Username and password do not match…" | P2 |
| WEB-LOG-04 | Usuário vazio | "Username is required" | P3 |
| WEB-LOG-05 | Senha vazia | "Password is required" | P3 |
| WEB-LOG-06 | Acessar `/inventory.html` sem sessão | Volta ao login com mensagem de acesso negado | P2 |

### Inventário (`inventory.spec.ts`)

| ID | Cenário | Resultado esperado | Prioridade |
|---|---|---|---|
| WEB-INV-01 | Listar produtos | Título "Products" e 6 itens | P1 |
| WEB-INV-02 | Ordenar Z–A | Nomes em ordem decrescente | P2 |
| WEB-INV-03 | Ordenar por preço crescente | Preços crescentes, o primeiro é 7.99 | P2 |
| WEB-INV-04 | Ordenar por preço decrescente | Preços decrescentes, o primeiro é 49.99 | P2 |
| WEB-INV-05 | Abrir detalhe do produto | URL `inventory-item.html?id=…`, nome e preço corretos | P2 |
| WEB-INV-06 | Logout pelo menu lateral | Volta à tela de login | P2 |

### Carrinho (`cart.spec.ts`)

| ID | Cenário | Resultado esperado | Prioridade |
|---|---|---|---|
| WEB-CRT-01 | Adicionar dois produtos | Badge "2", botões viram "Remove", itens listados no carrinho | P1 |
| WEB-CRT-02 | Remover pelo carrinho | Sobra apenas o outro item, badge "1" | P2 |
| WEB-CRT-03 | Continuar comprando | Volta ao inventário mantendo o badge | P3 |

### Checkout (`checkout.spec.ts`)

| ID | Cenário | Resultado esperado | Prioridade |
|---|---|---|---|
| WEB-CHK-01 | Compra completa | Resumo com os itens; subtotal = soma; total = subtotal + imposto; "Thank you for your order!" | P1 |
| WEB-CHK-02 | Sem nome | "First Name is required" | P3 |
| WEB-CHK-03 | Sem sobrenome | "Last Name is required" | P3 |
| WEB-CHK-04 | Sem CEP | "Postal Code is required" | P3 |
