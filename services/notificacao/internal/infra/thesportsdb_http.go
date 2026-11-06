package infra

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/arenapro/notificacao/internal/dominio"
)

const urlPadraoTheSportsDB = "https://www.thesportsdb.com/api/v1/json/123/searchevents.php"

// BuscadorTheSportsDB implementa dominio.BuscadorResultadoPartida consultando a API publica TheSportsDB.
type BuscadorTheSportsDB struct {
	urlBase     string
	clienteHTTP *http.Client
}

// respostaTheSportsDB mapeia o JSON retornado por searchevents.php
type respostaTheSportsDB struct {
	Event []eventoTheSportsDB `json:"event"`
}

type eventoTheSportsDB struct {
	StrEvent     string  `json:"strEvent"`
	DateEvent    string  `json:"dateEvent"`
	StrHomeTeam  string  `json:"strHomeTeam"`
	StrAwayTeam  string  `json:"strAwayTeam"`
	IntHomeScore *string `json:"intHomeScore"`
	IntAwayScore *string `json:"intAwayScore"`
	StrStatus    string  `json:"strStatus"`
}

// NovoBuscadorTheSportsDB cria o cliente HTTP para a API externa TheSportsDB.
func NovoBuscadorTheSportsDB(urlCustomizada string) *BuscadorTheSportsDB {
	base := strings.TrimSpace(urlCustomizada)
	if base == "" {
		base = urlPadraoTheSportsDB
	}
	return &BuscadorTheSportsDB{
		urlBase: base,
		clienteHTTP: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

// BuscarResultado consulta a API externa respeitando o contexto (timeout/cancelamento).
func (b *BuscadorTheSportsDB) BuscarResultado(
	ctx context.Context,
	timeCasa string,
	timeFora string,
) (*dominio.ResultadoPartidaExterno, error) {
	termo := fmt.Sprintf("%s_vs_%s", strings.TrimSpace(timeCasa), strings.TrimSpace(timeFora))
	urlCompleta := fmt.Sprintf("%s?e=%s", b.urlBase, url.QueryEscape(termo))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, urlCompleta, nil)
	if err != nil {
		return nil, fmt.Errorf("erro ao montar requisicao HTTP: %w", err)
	}

	resp, err := b.clienteHTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("erro na chamada HTTP para API externa: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API externa retornou status HTTP %d", resp.StatusCode)
	}

	var dados respostaTheSportsDB
	if err := json.NewDecoder(resp.Body).Decode(&dados); err != nil {
		return nil, fmt.Errorf("erro ao decodificar JSON da API externa: %w", err)
	}

	if len(dados.Event) == 0 {
		return &dominio.ResultadoPartidaExterno{
			Encontrada: false,
			Finalizada: false,
		}, nil
	}

	// Procura a partida mais recente que ja possua placar final registrado
	for _, ev := range dados.Event {
		if ev.IntHomeScore != nil && ev.IntAwayScore != nil &&
			strings.TrimSpace(*ev.IntHomeScore) != "" && strings.TrimSpace(*ev.IntAwayScore) != "" {
			placar := fmt.Sprintf("%sx%s", strings.TrimSpace(*ev.IntHomeScore), strings.TrimSpace(*ev.IntAwayScore))
			fonte := fmt.Sprintf("%s (%s)", ev.StrEvent, ev.DateEvent)
			return &dominio.ResultadoPartidaExterno{
				Encontrada:  true,
				Finalizada:  true,
				Placar:      placar,
				FonteEvento: fonte,
			}, nil
		}
	}

	primeiro := dados.Event[0]
	return &dominio.ResultadoPartidaExterno{
		Encontrada:  true,
		Finalizada:  false,
		Placar:      "",
		FonteEvento: fmt.Sprintf("%s (%s)", primeiro.StrEvent, primeiro.DateEvent),
	}, nil
}
