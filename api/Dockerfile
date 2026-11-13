# Imagem da API Quarkus em dois estagios (T8).
# O contexto do build e a raiz do monorepo para incluir ../protos compartilhado com o Go:
#   docker build -f api/Dockerfile -t palpitearena-api .
FROM eclipse-temurin:21-jdk AS build
WORKDIR /src
COPY protos protos
COPY api/gradlew api/gradlew
COPY api/gradle api/gradle
COPY api/gradle.properties api/settings.gradle.kts api/build.gradle.kts api/
WORKDIR /src/api
RUN sed -i 's/\r$//' gradlew && chmod +x gradlew
COPY api/src src
RUN ./gradlew build -x test --no-daemon

FROM eclipse-temurin:21-jre
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /src/api/build/quarkus-app /app
# Comando dedicado para aplicar migracoes Flyway e encerrar (Passo 18 / preDeployCommand)
RUN printf '#!/bin/sh\nexec java -Dpalpitearena.migrar.apenas=true -Dquarkus.http.port=0 -Djava.util.logging.manager=org.jboss.logmanager.LogManager -jar /app/quarkus-run.jar\n' > /app/migrar && chmod +x /app/migrar
EXPOSE 8080
CMD ["java", "-Dquarkus.http.host=0.0.0.0", "-Djava.util.logging.manager=org.jboss.logmanager.LogManager", "-jar", "/app/quarkus-run.jar"]
