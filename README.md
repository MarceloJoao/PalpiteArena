# PalpiteArena

Monorepo da plataforma **PalpiteArena** — sistema de palpites esportivos onde usuarios
cadastram palpites em partidas de futebol, acumulam pontos e disputam rankings por temporada.

## Equipe

| Nome                  | Matricula   |
|-----------------------|-------------|
| Antonnione Coelho     | 20250041045 |
| Joao Marcelo de Souza | 20220030819 |

**Disciplina:** DIM0547 — Desenvolvimento de Sistemas Web II
**Periodo:** 2026.2

---

## Estrutura

```
.
├── api/              # Servico principal — Java 21 + Quarkus
├── services/
│   └── notificacao/  # Servico de notificacoes — Go
├── protos/           # Definicoes Protobuf
├── docs/             # Proposta de arquitetura
├── docker-compose.yml
└── mise.toml
```

---

## Pre-requisitos

- [Java 21](https://www.oracle.com/java/technologies/downloads/)
- [Go 1.23+](https://go.dev/dl/)
- [mise](https://mise.jdx.dev/)
- [Docker](https://www.docker.com/)

---

## Como rodar

### Buildar tudo
```bash
mise run build
```

### Testar tudo
```bash
mise run test
```

### Apenas a API
```bash
mise run build:api
mise run test:api
```

### Apenas o servico Go
```bash
mise run build:go
mise run test:go
```

### Via Docker Compose
```bash
docker compose up --build
```

---

## Servicos

| Servico     | Porta | Stack          |
|-------------|-------|----------------|
| api         | 8080  | Java 21/Quarkus |
| notificacao | 8081  | Go 1.23        |

---

## Proposta de arquitetura

Ver [docs/Proposta.md](docs/Proposta.md).

## Backlog

Ver [GitHub Projects](https://github.com/MarceloJoao/PalpiteArena/projects).

## Vídeo de apresentação do projeto
Ver https://drive.google.com/file/d/15e5muSmkTPvpq0RxuDOFyqRg6K2rqs8r/view?usp=sharing
