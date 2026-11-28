package br.edu.arenapro.domain;

import java.time.LocalDateTime;
import java.util.Locale;
import java.util.Set;

/**
 * Regra pura (sem banco, sem rede) que decide como uma leitura da API externa de futebol altera uma Partida.
 *
 * Princípios:
 * - Uma partida FINALIZADA nunca é reaberta nem alterada.
 * - Só se aceita placar vindo de uma leitura que tenha gols E um status reconhecido (em andamento ou encerrada).
 * - O placar nunca "volta atrás" por causa de uma única leitura: uma queda no total de gols (ex.: dado velho em cache
 *   ou gol anulado pelo VAR) só é aceita quando a MESMA leitura menor se repete na consulta seguinte.
 */
public final class PlacarAoVivo {

    private static final Set<String> STATUS_ENCERRADO = Set.of("FT", "AET", "PEN", "AOT", "MATCH FINISHED", "FINISHED");
    private static final Set<String> STATUS_EM_ANDAMENTO = Set.of("1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT");

    private PlacarAoVivo() {
    }

    public enum Resultado {
        SEM_MUDANCA,
        PLACAR_ATUALIZADO,
        FINALIZADA,
        AGUARDANDO_CONFIRMACAO_DE_QUEDA
    }

    /** Leitura de um evento na API externa (gols nulos quando a API ainda não tem placar). */
    public record LeituraExterna(Integer golsCasa, Integer golsFora, String statusExterno) {

        public boolean temPlacar() {
            return golsCasa != null && golsFora != null;
        }

        public String placar() {
            return golsCasa + "x" + golsFora;
        }

        private String statusNormalizado() {
            return statusExterno == null ? "" : statusExterno.trim().toUpperCase(Locale.ROOT);
        }

        public boolean encerrada() {
            return STATUS_ENCERRADO.contains(statusNormalizado());
        }

        public boolean emAndamento() {
            return STATUS_EM_ANDAMENTO.contains(statusNormalizado());
        }

        public boolean statusDesconhecido() {
            return !encerrada() && !emAndamento();
        }
    }

    /** Soma dos gols de um placar "AxB"; devolve -1 quando o placar é nulo ou inválido. */
    public static int totalGols(String placar) {
        if (placar == null || placar.isBlank()) {
            return -1;
        }
        String[] partes = placar.trim().toLowerCase(Locale.ROOT).split("x");
        if (partes.length != 2) {
            return -1;
        }
        try {
            return Integer.parseInt(partes[0].trim()) + Integer.parseInt(partes[1].trim());
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    /**
     * Aplica a leitura externa na partida (altera placar e status quando cabível).
     *
     * @param quedaConfirmada true quando a leitura com menos gols já apareceu na consulta anterior
     * @param agora           horário atual no fuso de Brasília (a data da partida é guardada em horário de Brasília)
     */
    public static Resultado aplicar(Partida partida, LeituraExterna leitura, boolean quedaConfirmada, LocalDateTime agora) {
        if (partida == null || leitura == null || partida.getStatus() == StatusPartida.FINALIZADA) {
            return Resultado.SEM_MUDANCA;
        }
        if (!leitura.temPlacar()) {
            return Resultado.SEM_MUDANCA;
        }

        String novo = leitura.placar();

        boolean encerrada = leitura.encerrada();
        // Status desconhecido mas com placar e jogo iniciado há mais de 3h: a partida certamente já acabou
        if (!encerrada && leitura.statusDesconhecido() && partida.getData() != null
                && agora != null && partida.getData().plusHours(3).isBefore(agora)) {
            encerrada = true;
        }

        if (encerrada) {
            partida.setPlacar(novo);
            partida.setStatus(StatusPartida.FINALIZADA);
            return Resultado.FINALIZADA;
        }

        if (!leitura.emAndamento()) {
            // Status desconhecido e jogo recente: não arrisca gravar placar
            return Resultado.SEM_MUDANCA;
        }

        String atual = partida.getPlacar();
        if (novo.equals(atual)) {
            return Resultado.SEM_MUDANCA;
        }

        if (totalGols(novo) < totalGols(atual) && !quedaConfirmada) {
            return Resultado.AGUARDANDO_CONFIRMACAO_DE_QUEDA;
        }

        partida.setPlacar(novo);
        return Resultado.PLACAR_ATUALIZADO;
    }
}
