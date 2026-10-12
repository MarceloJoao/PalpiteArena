package br.edu.arenapro.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;

// Entidade que representa um time de futebol
@Entity
@Table(name = "time")
public class Time {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @NotBlank(message = "O nome do time é obrigatório")
    @Column(nullable = false, unique = true)
    private String nome;

    @Column(name = "escudo_url")
    private String escudoUrl;


    public String getEscudoUrl() {
        return escudoUrl;
    }
    public void setEscudoUrl(String escudoUrl) {
        this.escudoUrl = escudoUrl;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getNome() {
        return nome;
    }

    public void setNome(String nome) {
        this.nome = nome;
    }
}