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
}