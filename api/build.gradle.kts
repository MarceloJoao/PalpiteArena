plugins {
    java
    id("io.quarkus")
}

repositories {
    mavenCentral()
    mavenLocal()
}

val quarkusPlatformGroupId: String by project
val quarkusPlatformArtifactId: String by project
val quarkusPlatformVersion: String by project

dependencies {
    implementation(enforcedPlatform("${quarkusPlatformGroupId}:${quarkusPlatformArtifactId}:${quarkusPlatformVersion}"))
    implementation("io.quarkus:quarkus-rest")
    implementation("io.quarkus:quarkus-rest-jackson")
    implementation("io.quarkus:quarkus-arc")
    implementation("io.quarkus:quarkus-hibernate-orm-panache")
    implementation("io.quarkus:quarkus-jdbc-postgresql")
    implementation("io.quarkus:quarkus-flyway")
    implementation("io.quarkus:quarkus-hibernate-validator")
    implementation("io.quarkus:quarkus-smallrye-openapi")
    implementation("io.quarkus:quarkus-smallrye-health")
    implementation("io.quarkus:quarkus-grpc")
    testImplementation("io.quarkus:quarkus-junit")
    testImplementation("io.rest-assured:rest-assured")
    testImplementation("io.grpc:grpc-inprocess")
    testImplementation("com.tngtech.archunit:archunit-junit5:1.4.0")
}

group = "br.edu.arenapro"
version = "1.0.0-SNAPSHOT"

// Aponta o gerador de stubs do quarkus-grpc para a pasta ../protos compartilhada com o servico Go.
// No Windows, o executavel nativo do protoc falha quando o caminho possui acentos (ex.: "Área de Trabalho").
val caminhoTemAcentoNoWindows = System.getProperty("os.name").lowercase().contains("win") &&
    !projectDir.absolutePath.all { it.code < 128 }

val pastaProtos = if (caminhoTemAcentoNoWindows) {
    val tempRoot = File(System.getProperty("java.io.tmpdir"), "palpitearena-build")
    layout.buildDirectory.set(File(tempRoot, "build"))
    val tempProtos = File(tempRoot, "protos")
    File(tempProtos, "palpitearena").deleteRecursively()
    file("../protos").copyRecursively(tempProtos, overwrite = true)
    tempProtos
} else {
    file("../protos")
}

System.setProperty("quarkus.grpc.codegen.proto-directory", pastaProtos.absolutePath)

tasks.matching { it.name == "quarkusGenerateCode" || it.name == "quarkusGenerateCodeTests" }.configureEach {
    inputs.dir(pastaProtos)
}

java {
    sourceCompatibility = JavaVersion.VERSION_21
    targetCompatibility = JavaVersion.VERSION_21
}

tasks.withType<JavaCompile> {
    options.encoding = "UTF-8"
    options.compilerArgs.add("-parameters")
}

tasks.withType<Test> {
    systemProperty("e2e.live", System.getProperty("e2e.live") ?: "false")
    testLogging {
        showStandardStreams = true
    }
}
