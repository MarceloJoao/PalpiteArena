package br.edu.arenapro.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.List;

// Entidade que representa uma partida de futebol
@Entity
@Table(name = "partida")
public class Partida {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Relacionamento N:1 — muitas partidas podem ter o mesmo time em casa
    @ManyToOne
    @JoinColumn(name = "time_casa_id", nullable = false)
    private Time timeCasa;

    // Relacionamento N:1 — muitas partidas podem ter o mesmo time fora
    @ManyToOne
    @JoinColumn(name = "time_fora_id", nullable = false)
    private Time timeFora;

    @Column(name = "data", nullable = false)
    private LocalDateTime data;

    // Placar pode ser nulo antes da partida terminar (ex: "2x1")
    private String placar;

    // EnumType.STRING salva o texto no banco ("AGENDADA")
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private StatusPartida status = StatusPartida.AGENDADA;

    @JsonIgnore
    // Relacionamento 1:N — uma partida tem muitos palpites
    @OneToMany(mappedBy = "partida", cascade = CascadeType.ALL)
    private List<Palpite> palpites;

    // --- Getters e Setters ---

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Time getTimeCasa() {
        return timeCasa;
    }

    public void setTimeCasa(Time timeCasa) {
        this.timeCasa = timeCasa;
    }

    public Time getTimeFora() {
        return timeFora;
    }

    public void setTimeFora(Time timeFora) {
        this.timeFora = timeFora;
    }

    public LocalDateTime getData() {
        return data;
    }

    public void setData(LocalDateTime data) {
        this.data = data;
    }

    public String getPlacar() {
        return placar;
    }

    public void setPlacar(String placar) {
        this.placar = placar;
    }

    public StatusPartida getStatus() {
        return status;
    }

    public void setStatus(StatusPartida status) {
        this.status = status;
    }

    public List<Palpite> getPalpites() {
        return palpites;
    }

    public void setPalpites(List<Palpite> palpites) {
        this.palpites = palpites;
    }
}