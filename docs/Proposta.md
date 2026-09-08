## Sprint 0


## Visão de produto

```
Para usuários que acompanham esportes e gostam de competir com amigos.
Que querem acompanhar campeonatos e disputar palpites de maneira organizada.
O PalpiteArena é uma plataforma de palpites esportivos.
Que permite registrar palpites de jogos e disputar ranking com amigos.
Diferente de bolões feitos em planilhas ou grupos de WhatsApp.
Nosso produto calcula pontos e atualiza o ranking automaticamente após cada jogo.

```

---

## A Escolha entre Kotlin/Ktor e Java/Quarkus

```
Optamos por Java com Quarkus. A equipe possui maior domínio sobre Java,
adquirido ao longo da graduação, o que permite focar na construção das
funcionalidades sem desviar atenção para aprender uma nova linguagem.

A escolha do Quarkus como framework é uma oportunidade de conhecer uma
tecnologia nova e relevante no mercado. O Quarkus é otimizado para
containers e ambientes de nuvem, com tempo de inicialização reduzido e
baixo consumo de memória. Seu ecossistema oferece suporte nativo a REST,
JPA/Hibernate e injeção de dependência via CDI, cobrindo todas as
necessidades do domínio do PalpiteArena.

```

---

## A divisão entre o serviço principal e os microsserviços Go

A segunda decisão arquitetural: o que fica no serviço principal (Quarkus)
e o que vai para Go.

| Vai para o serviço principal (Quarkus)                                | Vai para o microsserviço Go                      |
|-----------------------------------------------------------------------|--------------------------------------------------|
| Entidades de domínio (Usuário, Partida, Palpite, Ranking)             | Coleta de resultados de partidas via API externa |
| Persistência e migrações (JPA/Hibernate)                              | Notificação dos usuários ao encerrar uma partida |
| Autenticação e autorização (JWT)                                      | Cache do ranking e dos resultados externos       |
| Orquestração dos casos de uso (registrar palpite, calcular pontuação) | Trabalho concorrente de I/O intensivo            |


## Definição do MVP

| No MVP                                          | Fora do MVP                                 |
|-------------------------------------------------|---------------------------------------------|
| CRUD de partidas                                | Assistente de IA integrada                  |
| Cadastro e autenticação de usuários             | Histórico detalhado de palpites por usuário |
| Registro de palpites antes do início dos jogos  | Estatísticas avançadas por usuário          |
| Cálculo automático de pontuação                 | Notificações por e-mail ou push             |
| Ranking de usuários                             | Login social (Google / GitHub)              |
| Consulta à API externa de resultados (Go)       | Sistema de ligas privadas entre amigos      |

Acreditamos que torcedores vão registrar palpites regularmente porque competir com amigos torna o acompanhamento dos jogos mais divertido.

## Backlog Inicial