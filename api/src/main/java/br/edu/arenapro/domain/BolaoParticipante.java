package br.edu.arenapro.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;

@Entity
@Table(name = "bolao_participante")
public class BolaoParticipante {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @JsonIgnore
    @ManyToOne
    @JoinColumn(name = "bolao_id", nullable = false)
    private Bolao bolao;

    @ManyToOne
    @JoinColumn(name = "usuario_id", nullable = false)
    private Usuario usuario;

    @Column(name = "papel", nullable = false)
    private String papel = "CONVIDADO"; // "CRIADOR" ou "CONVIDADO"

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private StatusParticipanteBolao status = StatusParticipanteBolao.PENDENTE;

    @Column(name = "valor_retido", nullable = false, precision = 12, scale = 2)
    private BigDecimal valorRetido = new BigDecimal("0.00");

    @Column(name = "multa_desistencia", nullable = false, precision = 12, scale = 2)
    private BigDecimal multaDesistencia = new BigDecimal("0.00");

    @Column(name = "pontos_totais", nullable = false)
    private Integer pontosTotais = 0;

    public boolean estaAtivoNoBolao() {
        return status == StatusParticipanteBolao.ACEITO || status == StatusParticipanteBolao.CONFIRMADO;
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

    public Usuario getUsuario() {
        return usuario;
    }

    public void setUsuario(Usuario usuario) {
        this.usuario = usuario;
    }

    public String getPapel() {
        return papel;
    }

    public void setPapel(String papel) {
        this.papel = papel;
    }

    public StatusParticipanteBolao getStatus() {
        return status;
    }

    public void setStatus(StatusParticipanteBolao status) {
        this.status = status;
    }

    public BigDecimal getValorRetido() {
        return valorRetido != null ? valorRetido : new BigDecimal("0.00");
    }

    public void setValorRetido(BigDecimal valorRetido) {
        this.valorRetido = valorRetido;
    }

    public BigDecimal getMultaDesistencia() {
        return multaDesistencia != null ? multaDesistencia : new BigDecimal("0.00");
    }

    public void setMultaDesistencia(BigDecimal multaDesistencia) {
        this.multaDesistencia = multaDesistencia;
    }

    public Integer getPontosTotais() {
        return pontosTotais != null ? pontosTotais : 0;
    }

    public void setPontosTotais(Integer pontosTotais) {
        this.pontosTotais = pontosTotais;
    }
}
