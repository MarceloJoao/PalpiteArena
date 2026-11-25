package br.edu.arenapro.domain;

import java.util.Optional;

/**
 * Opções de resultado em um Desafio X1 entre dois usuários:
 * - MANDANTE: vitória do time da casa;
 * - EMPATE: partida termina empatada;
 * - VISITANTE: vitória do time visitante.
 */
public enum OpcaoDesafio {
    MANDANTE,
    EMPATE,
    VISITANTE;

    /**
     * Determina qual opção de resultado ocorreu a partir de um placar no formato "2x1", "1 x 1" ou "0-2".
     */
    public static Optional<OpcaoDesafio> resultadoDoPlacar(String placar) {
        int[] gols = extrairGols(placar);
        if (gols == null) {
            return Optional.empty();
        }
        if (gols[0] > gols[1]) {
            return Optional.of(MANDANTE);
        }
        if (gols[0] < gols[1]) {
            return Optional.of(VISITANTE);
        }
        return Optional.of(EMPATE);
    }

    /**
     * Verifica se o placar informado já registra algum gol marcado na partida (golsCasa + golsFora > 0).
     */
    public static boolean placarTemGol(String placar) {
        int[] gols = extrairGols(placar);
        return gols != null && (gols[0] + gols[1]) > 0;
    }

    private static int[] extrairGols(String placar) {
        if (placar == null || placar.isBlank()) {
            return null;
        }
        String normalizado = placar.trim().toLowerCase().replace(" ", "").replace("-", "x");
        String[] partes = normalizado.split("x");
        if (partes.length != 2) {
            return null;
        }
        try {
            int casa = Integer.parseInt(partes[0]);
            int fora = Integer.parseInt(partes[1]);
            if (casa < 0 || fora < 0) {
                return null;
            }
            return new int[]{casa, fora};
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
