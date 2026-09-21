# Proposta — PalpiteArena

## 1. Visão do produto

```
Para torcedores que acompanham campeonatos de futebol
Que querem competir com amigos fazendo palpites nos jogos
O PalpiteArena é uma plataforma de palpites esportivos
Que permite registrar palpites de jogos e disputar ranking com amigos
Diferente de bolões feitos em planilhas ou grupos de WhatsApp
Nosso produto calcula pontos e atualiza o ranking automaticamente após cada jogo
```

---

## 2. Definição do MVP

O MVP é o escopo mínimo que entrega valor. Declaramos explicitamente o que fica fora.

| No MVP                                          | Fora do MVP                                 |
|-------------------------------------------------|---------------------------------------------|
| CRUD de partidas                                | Assistente de IA integrada                  |
| Cadastro e autenticação de usuários             | Histórico detalhado de palpites por usuário |
| Registro de palpites antes do início dos jogos  | Estatísticas avançadas por usuário          |
| Cálculo automático de pontuação                 | Notificações por e-mail ou push             |
| Ranking de usuários                             | Login social (Google / GitHub)              |
| Consulta à API externa de resultados (Go)       | Sistema de ligas privadas entre amigos      |

Acreditamos que torcedores vão registrar palpites regularmente porque
competir com amigos torna o acompanhamento dos jogos mais divertido
e engajante.

---

## 3. Backlog inicial

Backlog completo no GitHub Projects:
https://github.com/MarceloJoao/PalpiteArena/projects

| Prio | História | Critérios de aceitação | Sprint |
|------|----------|------------------------|--------|
| P1 | Como usuário, quero me cadastrar e fazer login para acessar a plataforma | JWT gerado no login; rotas protegidas sem token retornam 401 | 1 |
| P1 | Como administrador, quero cadastrar partidas para que os usuários possam palpitar | CRUD com data, times e status; validação de campos obrigatórios | 1 |
| P1 | Como usuário, quero registrar meu palpite em uma partida para competir no ranking | Palpite só aceito antes do início; um palpite por usuário por partida | 2 |
| P1 | Como sistema, quero consultar a API externa de futebol para atualizar os resultados automaticamente | Serviço Go agendado; placar atualizado ao encerrar a partida | 2 |
| P2 | Como usuário, quero ver o ranking atualizado para saber minha posição entre os participantes | Ordenado por pontuação; atualizado após cada partida encerrada | 3 |
| P2 | Como sistema, quero notificar os usuários ao encerrar uma partida para informar sua pontuação | Notificação enviada a todos que palpitaram; registrada no banco | 3 |

P1 é essencial ao MVP, P2 é importante, P3 é desejável.

---

## 4. Entidades do domínio

| Entidade | Atributos principais                              | Relações                       |
|----------|---------------------------------------------------|--------------------------------|
| Usuário  | id, nome, email, senha, pontuação total           | tem muitos Palpites            |
| Partida  | id, time_casa, time_fora, data, placar, status    | tem muitos Palpites            |
| Palpite  | id, placar_previsto, pontos_obtidos, criado_em    | pertence a Usuário e Partida   |
| Ranking  | posição, pontuação total                          | agregação de Palpites          |

---

## 5. Decisão da stack — Java/Quarkus

Escolhemos Java com Quarkus porque a equipe tem maior afinidade com Java,
adquirida ao longo da graduação, e quer consolidar os fundamentos da JVM
enquanto explora um framework moderno. A equipe já possui experiência com
Spring, e o Quarkus representa um novo aprendizado dentro do ecossistema
Java — com uma abordagem diferente, voltada para containers e nuvem, com
tempo de inicialização muito baixo. Seu ecossistema é rico e bem documentado,
com suporte nativo a OpenAPI, JPA/Hibernate, Testcontainers e GraalVM,
cobrindo todas as necessidades do domínio do PalpiteArena. Kotlin/Ktor,
apesar de ser uma alternativa interessante, exigiria aprender uma nova
linguagem ao mesmo tempo que o framework, o que aumentaria a complexidade
sem trazer benefícios diretos para as características do nosso sistema.

---

## 6. Divisão com o serviço Go

| Vai para o serviço principal (Quarkus)                                | Vai para o microsserviço Go                      |
|-----------------------------------------------------------------------|--------------------------------------------------|
| Entidades de domínio (Usuário, Partida, Palpite, Ranking)             | Coleta de resultados de partidas via API externa |
| Persistência e migrações (JPA/Hibernate)                              | Notificação dos usuários ao encerrar uma partida |
| Autenticação e autorização (JWT)                                      | Cache do ranking e dos resultados externos       |
| Orquestração dos casos de uso (registrar palpite, calcular pontuação) | Trabalho concorrente de I/O intensivo            |

O microsserviço Go possui duas responsabilidades: consultar uma API
externa de resultados de futebol para atualizar o placar das partidas,
e notificar os usuários ao encerrar cada jogo com sua pontuação obtida.
Essas tarefas envolvem I/O intensivo e integração com sistemas externos —
exatamente onde Go se destaca em desempenho e concorrência — e mantêm
o serviço principal focado apenas na lógica de negócio.

---

## 7. Equipe

| Nome | Matrícula |
|------|-----------|
| Antonnione Coelho | 20250041045 |
| João Marcelo de Soua | 20220030819 |

---

## 8. Coorte e integração

**Disciplina:** DIM0547 — Desenvolvimento de Sistemas Web II
**Período:** 2026.2
**Repositório:** https://github.com/MarceloJoao/PalpiteArena
**CI:** passando nos dois stacks (Quarkus e Go) em todo push e PR na branch `main`
