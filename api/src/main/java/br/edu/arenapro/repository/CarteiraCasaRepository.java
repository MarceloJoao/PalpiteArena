package br.edu.arenapro.repository;

import br.edu.arenapro.domain.CarteiraCasa;
import io.quarkus.hibernate.orm.panache.PanacheRepository;
import jakarta.enterprise.context.ApplicationScoped;
import java.math.BigDecimal;

@ApplicationScoped
public class CarteiraCasaRepository implements PanacheRepository<CarteiraCasa> {

    public CarteiraCasa obterOuCriar() {
        CarteiraCasa carteira = findAll().firstResult();
        if (carteira == null) {
            carteira = new CarteiraCasa();
            carteira.setSaldoTotal(new BigDecimal("0.00"));
            carteira.setTotalApostasLiquidadas(0);
            persist(carteira);
        }
        return carteira;
    }
}
