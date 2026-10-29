# PalpiteArena ⚽🏆

Monorepo da plataforma **PalpiteArena** — sistema de palpites esportivos onde usuários apostam em placares de partidas de futebol, acumulam pontos e disputam rankings por temporada.

[![CI](https://github.com/MarceloJoao/PalpiteArena/actions/workflows/ci.yml/badge.svg)](https://github.com/MarceloJoao/PalpiteArena/actions/workflows/ci.yml)

---

## 👥 Equipe

| Nome | Matrícula | GitHub |
|---|---|---|
| **Antonnione Coelho** | 20250041045 | [@antonionne-coelho](https://github.com/antonionne-coelho) |
| **João Marcelo de Souza** | 20220030819 | [@MarceloJoao](https://github.com/MarceloJoao) |

* **Disciplina:** DIM0547 — Desenvolvimento de Sistemas Web II
* **Período:** 2026.2 — UFRN
* **Docente:** Prof. Francisco Marques Filho

---

## 📐 Arquitetura e Tecnologias

O projeto é estruturado em microsserviços em um **monorepo**:

* **API Principal (`api/`):**
  * **Linguagem / Framework:** Java 21, Quarkus 3.39.1
  * **Persistência & ORM:** Hibernate ORM com Panache, PostgreSQL 16
  * **Versionamento de Banco:** Flyway (migrações `V1` a `V5`)
  * **Validação:** Jakarta Bean Validation (`@Valid`, `@NotBlank`, `@Size`, etc.)
  * **Tratamento de Erros:** Problem Details for HTTP APIs ([RFC 9457](https://datatracker.ietf.org/doc/html/rfc9457)) via `@ServerExceptionMapper`
  * **Documentação Interativa:** OpenAPI 3.0 e Swagger UI via SmallRye OpenAPI
* **Serviço de Notificações (`services/notificacao/`):**
  * **Linguagem:** Go 1.23
* **Infraestrutura e Orquestração:**
  * Docker, Docker Compose, GitHub Actions (CI), [mise-en-place](https://mise.jdx.dev/)

---

## 📁 Estrutura de Diretórios

```
.
├── .github/workflows/ci.yml # Pipeline de integração contínua (CI com PostgreSQL)
├── api/                     # Serviço principal (Java 21 + Quarkus)
│   ├── src/main/java/br/edu/arenapro/
│   │   ├── domain/          # Entidades JPA (Usuario, Time, Partida, Palpite)
│   │   ├── repository/      # PanacheRepository com paginação e filtros
│   │   └── resources/       # Endpoints REST, DTOs e ProblemDetailsHandler
│   ├── src/main/resources/
│   │   ├── application.properties
│   │   └── db/migration/    # Migrações Flyway versionadas (V1 a V5)
│   └── src/test/java/       # Testes com @QuarkusTest e RestAssured
├── services/
│   └── notificacao/         # Microsserviço de notificações (Go)
├── protos/                  # Contratos de comunicação Protobuf / gRPC
├── docs/                    # Proposta do projeto e especificações
├── docker-compose.yml       # Orquestração do ambiente completo (Postgres + Serviços)
└── mise.toml                # Automação de tarefas (build, test, up)
```

---

## 🚀 Como Executar

### Pré-requisitos
* [Docker](https://www.docker.com/) e Docker Compose
* [Java 21](https://www.oracle.com/java/technologies/downloads/) (para rodar localmente)
* [mise](https://mise.jdx.dev/) *(opcional, mas recomendado)*

---

### Opção 1: Ambiente Completo via Docker Compose

Para subir o banco de dados PostgreSQL, a API Quarkus e o serviço Go com um único comando:

```bash
docker compose up --build
```
*(ou se usar o mise: `mise run up`)*

---

### Opção 2: Desenvolvimento Local (API Quarkus com Live Reload)

1. **Suba apenas o banco PostgreSQL:**
   ```bash
   docker compose up -d db
   ```

2. **Inicie a API em modo de desenvolvimento:**
   ```bash
   cd api
   ./gradlew quarkusDev
   ```
   *(No Windows PowerShell: `.\gradlew.bat quarkusDev`)*

A aplicação estará disponível em `http://localhost:8080`.

---

## 📖 Documentação da API (OpenAPI & Swagger UI)

Com a API em execução, acesse a documentação interativa para visualizar esquemas e testar requisições:

* 🌐 **Swagger UI:** [http://localhost:8080/q/swagger-ui](http://localhost:8080/q/swagger-ui)
* 📄 **OpenAPI Spec (JSON):** [http://localhost:8080/q/openapi](http://localhost:8080/q/openapi)

---

## 🛣️ Endpoints Principais (Rotas REST)

A API segue rigorosamente as convenções REST, semântica HTTP (`201 Created` com `Location`, `204 No Content`, `404 Not Found`) e paginação:

| Método | Endpoint | Descrição | Status de Sucesso |
|---|---|---|---|
| **Usuários** | | | |
| `GET` | `/usuarios?pagina=0&tamanho=10` | Lista usuários paginados | `200 OK` |
| `GET` | `/usuarios/{id}` | Busca usuário por ID | `200 OK` |
| `POST` | `/usuarios` | Cadastra novo usuário | `201 Created` |
| `PUT` | `/usuarios/{id}` | Atualiza dados do usuário | `200 OK` |
| `DELETE` | `/usuarios/{id}` | Remove usuário | `204 No Content` |
| **Times** | | | |
| `GET` | `/times?pagina=0&tamanho=10` | Lista times com paginação | `200 OK` |
| `GET` | `/times/{id}` | Busca time por ID | `200 OK` |
| `POST` | `/times` | Cadastra novo time (com escudo) | `201 Created` |
| `PUT` | `/times/{id}` | Atualiza time | `200 OK` |
| `DELETE` | `/times/{id}` | Remove time | `204 No Content` |
| **Partidas** | | | |
| `GET` | `/partidas?pagina=0&tamanho=10` | Lista todas as partidas com paginação | `200 OK` |
| `GET` | `/partidas?status=AGENDADA` | Filtra partidas por status (`AGENDADA`, `EM_ANDAMENTO`, `ENCERRADA`, `CANCELADA`) | `200 OK` |
| `GET` | `/partidas/{id}` | Busca partida por ID | `200 OK` |
| `POST` | `/partidas` | Cadastra nova partida entre dois times | `201 Created` |
| `PUT` | `/partidas/{id}` | Atualiza placar/status da partida | `200 OK` |
| `DELETE` | `/partidas/{id}` | Remove partida | `204 No Content` |
| **Palpites** | | | |
| `GET` | `/palpites?pagina=0&tamanho=10` | Lista todos os palpites com paginação | `200 OK` |
| `GET` | `/palpites?usuarioId=1` | Filtra palpites por usuário | `200 OK` |
| `GET` | `/palpites?partidaId=1` | Filtra palpites por partida | `200 OK` |
| `GET` | `/palpites/{id}` | Busca palpite por ID | `200 OK` |
| `POST` | `/palpites` | Registra palpite de um usuário em uma partida | `201 Created` |
| `PUT` | `/palpites/{id}` | Atualiza placar previsto do palpite | `200 OK` |
| `DELETE` | `/palpites/{id}` | Remove palpite | `204 No Content` |

---

## 🧪 Testes Automatizados

Para executar os testes de validação, tratamento de erros RFC 9457 e semântica HTTP:

```bash
# Via mise (na raiz do projeto)
mise run test:api

# Ou diretamente pelo Gradle
cd api
./gradlew test
```
*(No Windows PowerShell: `.\gradlew.bat test`)*

---

## ⚠️ Padrão de Resposta de Erros (RFC 9457)

A API rejeita dados inválidos retornando o formato padronizado `application/problem+json`:

```json
{
  "type": "/problems/validation-error",
  "title": "Dados de entrada inválidos",
  "status": 400,
  "detail": "Um ou mais campos são inválidos. Veja 'errors' para os detalhes.",
  "instance": "/palpites",
  "errors": [
    {
      "campo": "partidaId",
      "mensagem": "não deve ser nulo"
    },
    {
      "campo": "placarprevisto",
      "mensagem": "não deve estar em branco"
    },
    {
      "campo": "usuarioId",
      "mensagem": "não deve ser nulo"
    }
  ]
}
```

---

## 📋 Gestão do Projeto & Entregas

* **Quadro da Sprint (GitHub Projects):** [PalpiteArena Backlog & Sprints](https://github.com/MarceloJoao/PalpiteArena/projects)
* **Documentação de Arquitetura:** [docs/Proposta.md](docs/Proposta.md)
* **Vídeo de Demonstração (Sprint 0):** [Apresentação da Proposta (Google Drive)](https://drive.google.com/file/d/15e5muSmkTPvpq0RxuDOFyqRg6K2rqs8r/view?usp=sharing)
* **Vídeo de Demonstração (Sprint 1):** *([Apresentação sprint 1](https://drive.google.com/file/d/1AixQI5D8RF-haknZz9uLRsh3ehOi13NP/view?usp=sharing))*
