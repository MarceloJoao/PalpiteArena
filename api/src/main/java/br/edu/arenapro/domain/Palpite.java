package br.edu.arenapro.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;

// Entidade que representa o palpite de um usuário em uma partida
@Entity
@Table(name = "palpite")
public class Palpite {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;


    @Column(name = "placar_previsto", nullable = false)
    private String placarprevisto;

    // Pontos ganhos após o encerramento da partida — começa em 0
    @Column(name = "pontos_obtidos")
    private Integer pontosObtidos = 0;

    // Data e hora em que o palpite foi registrado
    @Column(name = "criado_em")
    private LocalDateTime criadoEm = LocalDateTime.now();

    // Relacionamento N:1 — muitos palpites pertencem a uma partida
    @ManyToOne
    @JoinColumn(name = "partida_id", nullable = false)
    private Partida partida;

    // Relacionamento N:1 — muitos palpites pertencem a um usuário
    @ManyToOne
    @JoinColumn(name = "usuario_id", nullable = false)
    private Usuario usuario;

    // --- Getters e Setters ---

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getPlacarprevisto() {
        return placarprevisto;
    }

    public void setPlacarprevisto(String placarprevisto) {
        this.placarprevisto = placarprevisto;
    }

    public Integer getPontosObtidos() {
        return pontosObtidos;
    }

    public void setPontosObtidos(Integer pontosObtidos) {
        this.pontosObtidos = pontosObtidos;
    }

    public LocalDateTime getCriadoEm() {
        return criadoEm;
    }

    public void setCriadoEm(LocalDateTime criadoEm) {
        this.criadoEm = criadoEm;
    }

    public Partida getPartida() {
        return partida;
    }

    public void setPartida(Partida partida) {
        this.partida = partida;
    }

    public Usuario getUsuario() {
        return usuario;
    }

    public void setUsuario(Usuario usuario) {
        this.usuario = usuario;
    }

    /**
     * Calcula e atualiza os pontos obtidos pelo palpite com base no placar oficial ("2x1"):
     * - 3 pontos para placar exato;
     * - 1 ponto para acerto do vencedor ou empate;
     * - 0 pontos nos demais casos.
     */
    public int calcularPontos(String placarOficial) {
        if (placarOficial == null || placarprevisto == null) {
            this.pontosObtidos = 0;
            return 0;
        }
        String oficial = placarOficial.trim().toLowerCase();
        String previsto = placarprevisto.trim().toLowerCase();
        if (oficial.equals(previsto)) {
            this.pontosObtidos = 3;
            return 3;
        }
        int[] golsOficial = extrairGols(oficial);
        int[] golsPrevisto = extrairGols(previsto);
        if (golsOficial != null && golsPrevisto != null) {
            int saldoOficial = Integer.compare(golsOficial[0], golsOficial[1]);
            int saldoPrevisto = Integer.compare(golsPrevisto[0], golsPrevisto[1]);
            if (saldoOficial == saldoPrevisto) {
                this.pontosObtidos = 1;
                return 1;
            }
        }
        this.pontosObtidos = 0;
        return 0;
    }

    private static int[] extrairGols(String placar) {
        String[] partes = placar.split("x");
        if (partes.length != 2) {
            return null;
        }
        try {
            return new int[]{Integer.parseInt(partes[0].trim()), Integer.parseInt(partes[1].trim())};
        } catch (NumberFormatException e) {
            return null;
        }
    }
}