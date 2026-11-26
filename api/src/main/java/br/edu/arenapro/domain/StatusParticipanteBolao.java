package br.edu.arenapro.domain;

/**
 * Estado de participação de um usuário em um Bolão:
 * - PENDENTE: convidado ainda não aceitou;
 * - ACEITO: convidado aceitou (valor retido), escolhendo os placares das partidas;
 * - CONFIRMADO: participante já confirmou os placares de todas as partidas do bolão;
 * - RECUSADO: convidado recusou o convite;
 * - DESISTIU: participante que havia aceitado desistiu (penalizado em 20% para a Carteira Casa e 80% devolvidos);
 * - EXPIRADO: convidado não aceitou antes de a primeira partida do bolão acontecer.
 */
public enum StatusParticipanteBolao {
    PENDENTE,
    ACEITO,
    CONFIRMADO,
    RECUSADO,
    DESISTIU,
    EXPIRADO
}
