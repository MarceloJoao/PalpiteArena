# Palpite Arena

Monorepo da plataforma **Palpite Arena** — sistema de gestao de palpites individuais e bolão.

## Estrutura

```
.
├── api/              # Servico principal — Java 25 + Quarkus
├── services/
│   └── notificacao/  # Servico de notificacoes — Go
├── protos/           # Definicoes Protobuf
├── docs/             # Proposta de arquitetura
├── docker-compose.yml
└── mise.toml
```

## Pre-requisitos

- [Java 25](https://www.oracle.com/java/technologies/downloads/)
- [Go 1.23+](https://go.dev/dl/)
- [mise](https://mise.jdx.dev/)
- [Docker](https://www.docker.com/)

## Como rodar

### Buildar tudo
```bash
mise run build
```

### Testar tudo
```bash
mise run test
```

### Via Docker Compose
```bash
docker compose up --build
```

## Servicos

| Servico     | Porta | Stack           |
|-------------|-------|-----------------|
| api         | 8080  | Java 25/Quarkus |
| notificacao | 8081  | Go 1.23         |

## Arquitetura

Ver [docs/Proposta.md](docs/Proposta.md).
