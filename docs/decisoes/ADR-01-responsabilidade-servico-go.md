# ADR 01 — Responsabilidade do Microsserviço de Notificações e Resultados em Go

* **Status:** Aceito
* **Data:** 2026-10-22
* **Decisores:** Antonnione Coelho, João Marcelo de Sousa
* **Contexto:** Disciplina DIM0547 — Desenvolvimento de Sistemas Web II (Sprint 2)

---

## 1. Contexto

A plataforma **PalpiteArena** é um sistema de apostas e palpites esportivos onde usuários acumulam pontos com base nos resultados reais de partidas de futebol.

Para o sistema funcionar de ponta a ponta sem intervenção manual contínua, duas grandes necessidades operacionais de **I/O, espera por terceiros e agendamento** surgem:

1. **Obtenção de Resultados Externos (Web Scraper / API Externa de Futebol):**
   * As partidas reais têm horários fixos e placares dinâmicos. É necessário consultar periodicamente serviços externos (como football-data.org, API-Football ou feeds esportivos) para verificar se uma partida agendada foi iniciada ou encerrada com seu placar final.
2. **Disparo de Notificações por E-mail aos Usuários:**
   * Quando uma partida é encerrada e os palpites são apurados, centenas de usuários participantes devem receber e-mails transacionais (ex: via provedores como Resend, SendGrid ou SMTP) informando o placar final, se acertaram o resultado e a pontuação obtida na rodada.
   * Lembretes de início iminente de partida também são disparados por e-mail para incentivar o registro de palpites a tempo.

### O Problema de Executar isso na API Principal (Java/Quarkus):
* **Bloqueio de Threads:** Envio de e-mails em lote e chamadas HTTP a APIs externas possuem alta latência de rede. Processar isso na API principal bloquearia *worker threads*, degradando o tempo de resposta das requisições REST dos usuários (CRUDs).
* **Sobrecarga de Agendamento:** Tarefas periódicas de *polling* consumindo memória e CPU desnecessariamente no serviço crítico de banco de dados.
* **Tolerância a Falhas:** Falhas ou lentidões no servidor SMTP de e-mail ou na API de futebol não podem, sob hipótese alguma, indisponibilizar a API Quarkus nem travar a navegação dos usuários.

---

## 2. Decisão

Decidimos isolar todo o fluxo de **consulta de resultados externos, agendamento de tarefas e disparo de e-mails transacionais** em um microsserviço dedicado escrito em **Go (`services/notificacao`)**, comunicando-se com a API Quarkus exclusivamente via **gRPC (HTTP/2 binário com Protobuf)**.

### Responsabilidade em uma frase:
> **"O serviço gerencia o agendamento de consultas a APIs externas de resultados de futebol e processa o envio assíncrono e concorrente de e-mails de notificação de palpites aos usuários."**

### Por que Go?
1. **Concorrência Nativa e Leveza:** O uso de *Goroutines* e *Channels* em Go permite disparar centenas de e-mails e requisições HTTP externas em paralelo consumindo apenas alguns megabytes de memória, de forma muito mais enxuta do que a criação de threads pesadas na JVM.
2. **Controle Estrito de Timeout e Cancelamento:** Go trata prazos de forma nativa e obrigatória através de `context.Context`, garantindo que uma chamada externa lenta seja cancelada antes de degradar o sistema.
3. **Agendamento com `time.Ticker`:** Implementação simples e robusta de *workers* em segundo plano sem necessidade de bibliotecas pesadas de agendamento.

### Regra de Banco de Dados:
* **Banco Não Compartilhado:** Em estrito cumprimento ao padrão de microsserviços e às diretrizes da disciplina, o serviço Go **não acessa nem compartilha o banco de dados PostgreSQL da API**.
* A API Quarkus envia os dados dos destinatários (e-mail, nome, assunto, mensagem e pontos) como carga útil das chamadas gRPC.
* Da mesma forma, quando o serviço Go detecta um resultado final na API externa, ele avisa a API Quarkus via gRPC para que ela execute a atualização da partida e os cálculos no banco com transacionalidade controlada.

---

## 3. Consequências

### Positivas:
* **Resiliência Máxima:** Se o provedor de e-mail cair ou atingir limite de cota (*rate limit*), a API Quarkus continua 100% no ar, rápida e estável.
* **Escalabilidade Horizontal Independente:** O serviço Go de e-mails pode ser escalado isoladamente caso o volume de envios por rodada cresça exponencialmente.
* **Contrato Estrito:** A comunicação gRPC via arquivos `.proto` elimina inconsistências de payload entre Java e Go.

### Trade-offs / Negativas:
* **Gerenciamento de Ambientes:** Necessidade de orquestrar a execução de dois containers e portas distintas (`8080` para API REST e `50051/8081` para o gRPC em Go).
* **Entrega Assíncrona:** O envio de e-mails ocorre em segundo plano, havendo um pequeno intervalo (consistência eventual) entre a confirmação do placar e a chegada do e-mail na caixa de entrada do usuário.
