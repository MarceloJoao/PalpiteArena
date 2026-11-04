# Etapa 1 — compilar o codigo Go
FROM golang:1.27 AS builder
WORKDIR /app

# Baixa as dependencias primeiro para aproveitar o cache de camadas do Docker
COPY go.mod go.sum ./
RUN go mod download

# Copia todo o codigo fonte (incluindo pacotes internos e stubs pb)
COPY . .

# Compila e gera o binario estatico chamado "notificacao"
RUN CGO_ENABLED=0 GOOS=linux go build -o notificacao .

# Etapa 2 — imagem final (minima, sem o compilador)
FROM debian:bookworm-slim
WORKDIR /app

# Copia somente o binario gerado na etapa anterior
COPY --from=builder /app/notificacao .

# Porta que o servico gRPC vai escutar
EXPOSE 8081

# Comando que roda quando o container inicia
CMD ["./notificacao"]
