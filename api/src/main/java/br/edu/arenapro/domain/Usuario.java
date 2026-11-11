package br.edu.arenapro.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.*;
import java.util.List;
import java.util.Locale;

// Entidade que representa um usuário da plataforma
@Entity
@Table(name = "usuario")
public class Usuario {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String nome;

    // unique = true garante que não existam dois usuários com o mesmo email
    @Column(nullable = false, unique = true)
    private String email;

    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    @Column(nullable = false)
    private String senha;

    // Pontuação acumulada em todos os palpites — começa em 0
    @Column(name = "pontuacao_total")
    private Integer pontuacaoTotal = 0;

    @JsonIgnore
    // Relacionamento 1:N — um usuário tem muitos palpites
    @OneToMany(mappedBy = "usuario", cascade = CascadeType.ALL)
    private List<Palpite> palpites;

    /**
     * Verifica se a senha informada corresponde à senha cadastrada do usuário.
     */
    public boolean conferirSenha(String senhaInformada) {
        return this.senha != null && senhaInformada != null && this.senha.equals(senhaInformada);
    }

    /**
     * Determina o papel do usuário na plataforma (ADMIN para contas administrativas ou TORCEDOR).
     */
    public String obterPapel() {
        if (this.email == null) {
            return "TORCEDOR";
        }
        String emailMin = this.email.trim().toLowerCase(Locale.ROOT);
        if (emailMin.startsWith("admin@") || emailMin.endsWith("@admin.arenapro.com")) {
            return "ADMIN";
        }
        return "TORCEDOR";
    }

    // --- Getters e Setters ---

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

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getSenha() {
        return senha;
    }

    public void setSenha(String senha) {
        this.senha = senha;
    }

    public Integer getPontuacaoTotal() {
        return pontuacaoTotal;
    }

    public void setPontuacaoTotal(Integer pontuacaoTotal) {
        this.pontuacaoTotal = pontuacaoTotal;
    }

    public List<Palpite> getPalpites() {
        return palpites;
    }

    public void setPalpites(List<Palpite> palpites) {
        this.palpites = palpites;
    }
}
