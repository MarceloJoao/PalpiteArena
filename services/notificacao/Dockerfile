# Etapa 1 — compilar o codigo Go
# Usa a imagem oficial do Go para ter o compilador disponivel
FROM golang:1.23 AS builder
WORKDIR /app

# Copia o arquivo de modulo e o codigo fonte
COPY go.mod ./
COPY *.go ./

# Compila e gera o binario chamado "notificacao"
RUN go build -o notificacao .

# Etapa 2 — imagem final (minima, sem o compilador)
# Usa uma imagem Debian bem leve para rodar apenas o binario
FROM debian:bookworm-slim
WORKDIR /app

# Copia somente o binario gerado na etapa anterior
COPY --from=builder /app/notificacao .

# Porta que o servico vai escutar
EXPOSE 8081

# Comando que roda quando o container inicia
CMD ["./notificacao"]
