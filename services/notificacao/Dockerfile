# Etapa 1 — compilar o codigo Go (dois estagios)
FROM golang:1.26 AS builder
WORKDIR /app

# Baixa as dependencias primeiro para aproveitar o cache de camadas do Docker
COPY go.mod go.sum ./
RUN go mod download

# Copia todo o codigo fonte (incluindo pacotes internos e stubs pb)
COPY . .

# Compila e gera o binario estatico chamado "notificacao"
RUN CGO_ENABLED=0 GOOS=linux go build -o /notificacao .

# Etapa 2 — imagem final minima (distroless, com certificados TLS e sem shell/compilador)
FROM gcr.io/distroless/static-debian12
COPY --from=builder /notificacao /notificacao
USER nonroot
EXPOSE 8081
ENTRYPOINT ["/notificacao"]
