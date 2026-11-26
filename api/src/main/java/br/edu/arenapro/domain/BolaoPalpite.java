package br.edu.arenapro.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "bolao_palpite")
public class BolaoPalpite {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @JsonIgnore
    @ManyToOne
    @JoinColumn(name = "bolao_id", nullable = false)
    private Bolao bolao;

    @ManyToOne
    @JoinColumn(name = "partida_id", nullable = false)
    private Partida partida;

    @ManyToOne
    @JoinColumn(name = "usuario_id", nullable = false)
    private Usuario usuario;

    @Column(name = "placar_previsto", nullable = false)
    private String placarPrevisto;

    @Column(name = "pontos_obtidos", nullable = false)
    private Integer pontosObtidos = 0;

    /**
     * Calcula os pontos obtidos neste palpite do bolão:
     * O Bolão aposta exclusivamente no placar exato — cada acerto de placar soma 3 pontos (e erro soma 0).
     */
    public int calcularPontos(String placarReal) {
        if (placarReal == null || placarReal.isBlank() || this.placarPrevisto == null || this.placarPrevisto.isBlank()) {
            this.pontosObtidos = 0;
            return 0;
        }
        try {
            String previstoNorm = Bolao.normalizarPlacar(this.placarPrevisto);
            String realNorm = Bolao.normalizarPlacar(placarReal);
            int pts = previstoNorm.equals(realNorm) ? 3 : 0;
            this.pontosObtidos = pts;
            return pts;
        } catch (IllegalArgumentException e) {
            this.pontosObtidos = 0;
            return 0;
        }
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Bolao getBolao() {
        return bolao;
    }

    public void setBolao(Bolao bolao) {
        this.bolao = bolao;
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

    public String getPlacarPrevisto() {
        return placarPrevisto;
    }

    public void setPlacarPrevisto(String placarPrevisto) {
        this.placarPrevisto = placarPrevisto;
    }

    public Integer getPontosObtidos() {
        return pontosObtidos != null ? pontosObtidos : 0;
    }

    public void setPontosObtidos(Integer pontosObtidos) {
        this.pontosObtidos = pontosObtidos;
    }
}
