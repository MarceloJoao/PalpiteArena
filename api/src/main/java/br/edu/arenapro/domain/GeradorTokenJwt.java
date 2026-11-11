package br.edu.arenapro.domain;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Serviço puro de domínio para emissão e validação de tokens JWT (RFC 7519, algoritmo HS256).
 * Não depende de bibliotecas externas nem do runtime do Quarkus, preservando o isolamento do domínio.
 */
public class GeradorTokenJwt {

    private static final String ALGORITMO_HMAC = "HmacSHA256";
    private static final String CABECALHO_JSON = "{\"alg\":\"HS256\",\"typ\":\"JWT\"}";
    private static final String SEGREDO_PADRAO = "palpitearena-chave-secreta-jwt-2026-ufrn-dim0547";
    private static final long VALIDADE_PADRAO_SEGUNDOS = 86_400L; // 24 horas

    private static final Pattern PADRAO_SUB = Pattern.compile("\"sub\":\"([^\"]+)\"");
    private static final Pattern PADRAO_NOME = Pattern.compile("\"nome\":\"([^\"]+)\"");
    private static final Pattern PADRAO_EMAIL = Pattern.compile("\"email\":\"([^\"]+)\"");
    private static final Pattern PADRAO_PAPEL = Pattern.compile("\"papel\":\"([^\"]+)\"");
    private static final Pattern PADRAO_EXP = Pattern.compile("\"exp\":(\\d+)");

    private final byte[] chaveSecreta;
    private final long validadeSegundos;

    public GeradorTokenJwt() {
        this(obterSegredoAmbiente(), VALIDADE_PADRAO_SEGUNDOS);
    }

    public GeradorTokenJwt(String segredo, long validadeSegundos) {
        String chaveEfetiva = (segredo == null || segredo.isBlank()) ? SEGREDO_PADRAO : segredo;
        this.chaveSecreta = chaveEfetiva.getBytes(StandardCharsets.UTF_8);
        this.validadeSegundos = validadeSegundos > 0 ? validadeSegundos : VALIDADE_PADRAO_SEGUNDOS;
    }

    private static String obterSegredoAmbiente() {
        String env = System.getenv("JWT_SECRET");
        return (env != null && !env.isBlank()) ? env : SEGREDO_PADRAO;
    }

    public long getValidadeSegundos() {
        return validadeSegundos;
    }

    /**
     * Gera um token JWT assinado (HS256) para o usuário informado.
     */
    public String gerarToken(Usuario usuario) {
        if (usuario == null || usuario.getEmail() == null) {
            throw new IllegalArgumentException("Usuário inválido para geração de token JWT");
        }
        long agora = Instant.now().getEpochSecond();
        long expiraEm = agora + validadeSegundos;
        String sub = usuario.getId() != null ? usuario.getId().toString() : "0";
        String nome = escaparJson(usuario.getNome() != null ? usuario.getNome() : "");
        String email = escaparJson(usuario.getEmail());
        String papel = escaparJson(usuario.obterPapel());

        String payloadJson = String.format(
                "{\"sub\":\"%s\",\"nome\":\"%s\",\"email\":\"%s\",\"papel\":\"%s\",\"iat\":%d,\"exp\":%d}",
                sub, nome, email, papel, agora, expiraEm);

        String cabecalhoBase64 = codificarBase64Url(CABECALHO_JSON.getBytes(StandardCharsets.UTF_8));
        String payloadBase64 = codificarBase64Url(payloadJson.getBytes(StandardCharsets.UTF_8));
        String conteudoAssinado = cabecalhoBase64 + "." + payloadBase64;
        String assinaturaBase64 = assinar(conteudoAssinado);

        return conteudoAssinado + "." + assinaturaBase64;
    }

    /**
     * Valida a assinatura HMAC-SHA256 e a data de expiração do token JWT.
     */
    public Optional<DadosTokenJwt> validarToken(String token) {
        if (token == null || token.isBlank()) {
            return Optional.empty();
        }
        String tokenLimpo = token.trim();
        if (tokenLimpo.regionMatches(true, 0, "Bearer ", 0, 7)) {
            tokenLimpo = tokenLimpo.substring(7).trim();
        }

        String[] partes = tokenLimpo.split("\\.");
        if (partes.length != 3) {
            return Optional.empty();
        }

        String conteudoAssinado = partes[0] + "." + partes[1];
        String assinaturaEsperada = assinar(conteudoAssinado);

        if (!MessageDigest.isEqual(
                assinaturaEsperada.getBytes(StandardCharsets.UTF_8),
                partes[2].getBytes(StandardCharsets.UTF_8))) {
            return Optional.empty();
        }

        try {
            String payloadJson = new String(Base64.getUrlDecoder().decode(partes[1]), StandardCharsets.UTF_8);
            String sub = extrairCampo(PADRAO_SUB, payloadJson);
            String nome = extrairCampo(PADRAO_NOME, payloadJson);
            String email = extrairCampo(PADRAO_EMAIL, payloadJson);
            String papel = extrairCampo(PADRAO_PAPEL, payloadJson);
            String expStr = extrairCampo(PADRAO_EXP, payloadJson);

            if (sub == null || email == null || expStr == null) {
                return Optional.empty();
            }

            long exp = Long.parseLong(expStr);
            if (Instant.now().getEpochSecond() > exp) {
                return Optional.empty();
            }

            Long usuarioId = Long.parseLong(sub);
            return Optional.of(new DadosTokenJwt(
                    usuarioId,
                    nome != null ? nome : "",
                    email,
                    papel != null ? papel : "TORCEDOR",
                    exp));
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    private String assinar(String dados) {
        try {
            Mac mac = Mac.getInstance(ALGORITMO_HMAC);
            mac.init(new SecretKeySpec(chaveSecreta, ALGORITMO_HMAC));
            byte[] bytesAssinatura = mac.doFinal(dados.getBytes(StandardCharsets.UTF_8));
            return codificarBase64Url(bytesAssinatura);
        } catch (Exception e) {
            throw new IllegalStateException("Falha ao assinar token JWT", e);
        }
    }

    private static String codificarBase64Url(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String escaparJson(String valor) {
        return valor.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static String extrairCampo(Pattern padrao, String json) {
        Matcher matcher = padrao.matcher(json);
        return matcher.find() ? matcher.group(1) : null;
    }

    public record DadosTokenJwt(
            Long usuarioId,
            String nome,
            String email,
            String papel,
            long expiraEmEpoch) {
    }
}
