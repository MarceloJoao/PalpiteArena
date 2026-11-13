# ADR 02 — Estratégia de Implantação em Nuvem (Render, Neon e GHCR)

* **Status:** Aceito
* **Data:** 2026-11-13
* **Decisores:** Antonnione Coelho, João Marcelo de Souza
* **Contexto:** Disciplina DIM0547 — Desenvolvimento de Sistemas Web II (Sprint 2 — T10 / T11)

---

## 1. Contexto

Na Sprint 2, o sistema **PalpiteArena** precisa estar disponível publicamente na internet com um banco de dados relacional gerenciado, sem expor credenciais no repositório Git, aplicando migrações de esquema de forma automatizada e mantendo a API funcional mesmo quando serviços acessórios estão indisponíveis.

O ecossistema do projeto é composto por:
1. **API Principal (`api/`):** Aplicação Java 21 + Quarkus 3.39.1 empacotada em container Docker de dois estágios (`api/Dockerfile`), responsável pelas rotas REST, autenticação JWT, regras de pontuação, interface web estática e persistência via Hibernate/Panache.
2. **Banco de Dados Relacional:** PostgreSQL 16 com esquema gerenciado exclusivamente por migrações versionadas do **Flyway** (`V1` a `V5`).
3. **Microsserviço de Notificações e Resultados (`services/notificacao/`):** Serviço em Go que conversa com a API por **gRPC** (HTTP/2 com Protocol Buffers) para envio concorrente de e-mails e consulta de placares na API externa *TheSportsDB*.

Precisamos definir onde hospedar a API e o banco de dados em planos gratuitos acadêmicos, como publicar as imagens de container, como gerenciar segredos e migrações, e como lidar com as restrições de rede de plataformas gratuitas para tráfego gRPC entre containers.

---

## 2. Decisão

Decidimos implantar a arquitetura em nuvem combinando **Neon** (banco PostgreSQL gerenciado), **Render** (plataforma de container para a API Quarkus) e **GitHub Actions + GitHub Container Registry (GHCR)** para integração e entrega contínuas:

### 2.1. Banco de Dados Gerenciado no Neon
* O banco PostgreSQL de produção roda no **Neon** (`https://neon.tech`), em instância gerenciada gratuita com conexão criptografada via TLS (`sslmode=require`).
* O Hibernate ORM está configurado com `quarkus.hibernate-orm.schema-management.strategy=none`, garantindo que nenhuma tabela seja alterada fora do controle de versão do Flyway.

### 2.2. Plataforma de Container no Render e Imagens no GHCR
* A API Quarkus é publicada como um **Web Service Docker** no **Render** (`https://render.com`), especificado de forma reprodutível no arquivo [`render.yaml`](../../render.yaml) na raiz do repositório.
* A aplicação escuta dinamicamente na porta fornecida pela plataforma por meio da variável de ambiente `PORT` (`quarkus.http.port=${PORT:${API_PORT:8080}}`).
* A cada *push* na branch `main` (após aprovação nos jobs `Build & Test API` e `Lint Proto & Test Go Service`), o workflow [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) constrói e publica as imagens de container no **GitHub Container Registry**:
  * `ghcr.io/marcelojoao/palpitearena/api:latest` (e tag do commit SHA)
  * `ghcr.io/marcelojoao/palpitearena/notificacao:latest` (e tag do commit SHA)

### 2.3. Gestão de Segredos Fora do Repositório
* Nenhuma senha, chave privada ou *connection string* de produção é armazenada no repositório Git.
* No [`render.yaml`](../../render.yaml), as variáveis sensíveis são declaradas com `sync: false` (`DATABASE_URL`, `DATABASE_USER`, `DATABASE_PASSWORD`) ou `generateValue: true` (`JWT_SECRET`), sendo injetadas exclusivamente pelo cofre de variáveis de ambiente do painel do Render em tempo de execução.
* O arquivo [`.env.example`](../../.env.example) documenta apenas os nomes das variáveis com valores locais de desenvolvimento.

### 2.4. Aplicação Automatizada de Migrações (Task, CI e Subida)
* O projeto disponibiliza o comando dedicado **`migrar`** (`/app/migrar` dentro da imagem Docker e `mise run migrar` localmente via `MigracaoStartup`), que conecta ao banco configurado em `DATABASE_URL`, executa todas as migrações pendentes do Flyway (`V1` a `V5`) e encerra o processo com código `0`.
* No pipeline de **CI** ([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)), o passo `Aplicar migracoes Flyway por comando (migrar)` valida a aplicação completa das migrações contra uma instância limpa do PostgreSQL 16 antes de executar a suíte de testes.
* No plano gratuito do Render — onde o recurso `preDeployCommand` é restrito a planos pagos — a API também mantém `quarkus.flyway.migrate-at-start=true`, garantindo que qualquer nova migração seja aplicada automaticamente antes de a API começar a receber tráfego HTTP.

### 2.5. Monitoramento de Saúde (Health Check)
* A API expõe os endpoints padronizados do SmallRye Health em `GET /q/health`, `GET /q/health/live` e `GET /q/health/ready`.
* O Render está configurado com `healthCheckPath: /q/health`, verificando continuamente tanto se o processo Quarkus está ativo quanto se a conexão JDBC com o banco no Neon está saudável (`status: "UP"`).

### 2.6. O que ficou fora do ar (Microsserviço Go) e por quê
* **Decisão:** Na nuvem pública (Render Free), implantamos **apenas a API Quarkus conectada ao banco Neon**. O microsserviço Go (`services/notificacao`) **não é publicado na nuvem gratuita**, sendo executado e avaliado junto com a API e o banco através do `docker compose up --build`.
* **Motivo técnico (limites do plano gratuito do Render):**
  1. Serviços privados (`type: pserv`) não possuem instância gratuita no Render (exigem o plano pago *Starter*);
  2. Um *Web Service* gratuito no Render pode abrir conexões de saída, mas **não recebe tráfego pela rede privada interna** de outros serviços;
  3. O proxy reverso público dos *Web Services* gratuitos do Render termina TLS na borda e encaminha apenas HTTP/1.1 para o container, não suportando chamadas gRPC em texto puro (`h2c`) entre serviços distintos pela internet.
* **Comportamento da API sem o serviço Go (Degradação Graciosa):**
  * Conforme implementado na Tarefa 6 (`NotificadorPalpiteGrpc`), toda chamada gRPC da API possui *deadline* estrito (`withDeadlineAfter(2, TimeUnit.SECONDS)`) e captura `StatusRuntimeException` (`UNAVAILABLE`, `DEADLINE_EXCEEDED`, `INVALID_ARGUMENT`).
  * Quando o serviço Go não está acessível na nuvem:
    * O cadastro de usuários, login JWT, CRUD de times, partidas e palpites e o cálculo de pontos com placar informado funcionam **100% normalmente**;
    * O envio de e-mail é tratado como operação acessória (registra `WARN` no log e retorna `false` sem interromper a transação HTTP);
    * Caso alguém chame a consulta automática de placar externo sem informar o placar no corpo e sem o serviço Go disponível, a API responde dentro do prazo com um erro semântico padronizado (`422 Unprocessable Entity` no formato RFC 9457 `application/problem+json`), sem nunca travar nem retornar `500 Internal Server Error`.

---

## 3. Alternativas Consideradas

1. **Banco PostgreSQL no próprio Render (Render Postgres Free):**
   * *Descartado:* As instâncias gratuitas de PostgreSQL no Render expiram e são removidas após 30 dias. O **Neon** oferece camada gratuita persistente (*serverless*), com suporte nativo a *connection pooling* e recuperação rápida.
2. **Hospedar a API e o Go no Fly.io ou Railway:**
   * *Descartado:* Ambas as plataformas passaram a exigir cartão de crédito internacional ou oferecem apenas créditos de teste temporários (*trial*), enquanto Render + Neon permitem operação contínua sem custo para projetos acadêmicos.
3. **Expor o microsserviço Go por REST/JSON em vez de gRPC para contornar o proxy gratuito:**
   * *Descartado:* Descaracterizaria o requisito central da Sprint 2 de comunicação binária tipada por contrato **Protocol Buffers + gRPC**. Manter gRPC no `docker compose` e nos testes automatizados em memória, aliado à degradação graciosa na nuvem, cumpre integralmente a arquitetura proposta.

---

## 4. Consequências

### Positivas:
* **Custo Zero e Persistência:** API e banco PostgreSQL acessíveis publicamente por URL HTTPS com certificado válido e dados persistidos no Neon.
* **Segurança de Credenciais:** Zero segredos no histórico do Git; fácil rotação de senhas pelo painel do Render/Neon.
* **Reprodutibilidade:** Qualquer avaliador pode inspecionar a API e o Swagger UI diretamente pelo navegador na URL pública, ou subir a topologia completa com gRPC localmente via `docker compose up --build`.

### Trade-offs / Negativas:
* **Cold Start no Plano Gratuito:** Instâncias gratuitas do Render hibernam após 15 minutos sem requisições; a primeira chamada após um período ocioso leva cerca de 30 a 50 segundos para acordar o container JVM.
* **Funcionalidade gRPC restrita ao ambiente local/compose:** Na URL pública do Render, a API demonstra a resiliência (degradação graciosa sem o serviço Go), enquanto o fluxo completo de gRPC com o Go é demonstrado no ambiente `docker compose` e na suíte de testes automatizados do CI.
