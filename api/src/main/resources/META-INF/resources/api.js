/**
 * Cliente HTTP e Controlador do Front-end da PalpiteArena (api.js)
 * - Busca partidas reais de Hoje e Amanhã na API externa TheSportsDB;
 * - Permite importar partidas externas para o banco da API Quarkus (POST /times + POST /partidas);
 * - Lista o Mural de Partidas (GET /partidas), registra palpites (POST /palpites)
 *   e aciona a apuração oficial via microsserviço Go + gRPC (POST /partidas/{id}/apurar);
 * - Gerencia autenticação JWT (POST /auth/login, GET /auth/eu, POST /usuarios).
 */

const CHAVE_SESSAO = 'palpitearena_sessao';
const URL_THESPORTSDB_DIA = 'https://www.thesportsdb.com/api/v1/json/123/eventsday.php';

// Detecta se está rodando servido pela própria API (:8080 ou Render) ou aberto via Live Server / arquivo local
const API_BASE_URL =
  window.location.protocol === 'file:' || window.location.port === '5500'
    ? 'http://localhost:8080'
    : '';

// Escudo SVG padrão caso algum time não possua imagem na API
const ESCUDO_PADRAO =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><path fill='%231e293b' stroke='%2310b981' stroke-width='3' d='M32 6L10 14v18c0 14 9.4 23.6 22 26 12.6-2.4 22-12 22-26V14L32 6z'/><text x='32' y='39' font-size='20' text-anchor='middle' fill='%23f8fafc' font-family='sans-serif' font-weight='bold'>⚽</text></svg>";

let partidasExternasCache = [];
let apiOnline = false;

/* ==========================================================================
   1. SESSÃO JWT E CLIENTE HTTP (RFC 9457 Problem Details)
   ========================================================================== */

function obterSessao() {
  try {
    const bruto = localStorage.getItem(CHAVE_SESSAO);
    return bruto ? JSON.parse(bruto) : null;
  } catch {
    return null;
  }
}

function salvarSessao(dadosLogin) {
  if (!dadosLogin) {
    localStorage.removeItem(CHAVE_SESSAO);
  } else {
    localStorage.setItem(CHAVE_SESSAO, JSON.stringify(dadosLogin));
  }
  atualizarCabecalhoUsuario();
}

async function requisicaoApi(caminho, opcoes = {}) {
  const sessao = obterSessao();
  const cabecalhos = {
    Accept: 'application/json',
    ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}),
    ...(sessao && sessao.token ? { Authorization: `Bearer ${sessao.token}` } : {}),
    ...(opcoes.headers || {}),
  };

  const resposta = await fetch(`${API_BASE_URL}${caminho}`, {
    ...opcoes,
    headers: cabecalhos,
  });

  if (resposta.status === 204) {
    return null;
  }

  const texto = await resposta.text();
  let corpo = null;
  if (texto) {
    try {
      corpo = JSON.parse(texto);
    } catch {
      corpo = { detail: texto };
    }
  }

  if (!resposta.ok) {
    throw extrairErroProblemDetails(corpo, resposta.status);
  }

  return corpo;
}

function extrairErroProblemDetails(problema, statusHttp) {
  if (!problema || typeof problema !== 'object') {
    return new Error(`Erro HTTP ${statusHttp} ao comunicar com a API.`);
  }
  if (Array.isArray(problema.errors) && problema.errors.length > 0) {
    const detalhesCampos = problema.errors
      .map((e) => `${e.campo}: ${e.mensagem}`)
      .join(' | ');
    return new Error(`${problema.title || 'Dados inválidos'} — ${detalhesCampos}`);
  }
  const mensagem = problema.detail || problema.title || `Erro HTTP ${statusHttp}`;
  return new Error(mensagem);
}

function mostrarToast(mensagem, tipo = 'sucesso') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${tipo}`;
  toast.textContent = mensagem;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-saindo');
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

function selecionarAba(idAba) {
  document.querySelectorAll('.aba-conteudo').forEach((secao) => {
    secao.classList.toggle('ativa', secao.id === `aba-${idAba}`);
  });
  document.querySelectorAll('.aba-btn').forEach((botao) => {
    botao.classList.toggle('ativa', botao.dataset.aba === idAba);
  });

  if (idAba === 'palpites') {
    carregarMeusPalpites();
  } else if (idAba === 'ranking') {
    carregarRanking();
  } else if (idAba === 'admin') {
    carregarPainelAdmin();
  } else if (idAba === 'partidas' && apiOnline) {
    carregarPartidasArena();
  }
}

/* ==========================================================================
   2. SAÚDE DA API E AUTENTICAÇÃO JWT (Etapa 2)
   ========================================================================== */

async function verificarStatusApi() {
  const indicador = document.getElementById('status-api');
  if (!indicador) return false;

  try {
    const saude = await requisicaoApi('/q/health/live');
    if (saude && saude.status === 'UP') {
      indicador.textContent = '● API Quarkus Online';
      indicador.className = 'badge badge-online';
      apiOnline = true;
      return true;
    }
    indicador.textContent = '● API Instável';
    indicador.className = 'badge badge-aviso';
    apiOnline = false;
    return false;
  } catch {
    indicador.textContent = '● API Quarkus Offline';
    indicador.className = 'badge badge-offline';
    apiOnline = false;
    return false;
  }
}

async function validarSessaoExistenteNoBanco() {
  const sessao = obterSessao();
  if (!sessao || !sessao.usuarioId) return;
  try {
    await requisicaoApi(`/usuarios/${sessao.usuarioId}`);
  } catch {
    // Caso o banco tenha sido recriado e o usuario antigo nao exista mais, limpa a sessao fantasma
    salvarSessao(null);
  }
}

function atualizarCabecalhoUsuario() {
  const container = document.getElementById('info-usuario-topo');
  if (!container) return;

  const sessao = obterSessao();
  if (!sessao || !sessao.token) {
    container.innerHTML = `<span class="badge badge-aviso">Visitante (Não autenticado)</span>`;
    return;
  }

  const classePapel = sessao.papel === 'ADMIN' ? 'badge-info' : 'badge-online';
  container.innerHTML = `
    <span class="badge ${classePapel}">
      👤 ${escaparHtml(sessao.nome)} (${escaparHtml(sessao.papel || 'TORCEDOR')})
    </span>
    <button id="btn-sair" class="btn btn-secundario btn-pequeno" type="button">Sair</button>
  `;

  const btnSair = document.getElementById('btn-sair');
  if (btnSair) {
    btnSair.addEventListener('click', () => {
      salvarSessao(null);
      mostrarToast('Sessão encerrada com sucesso.');
    });
  }
}

async function realizarLogin(evento) {
  evento.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const senha = document.getElementById('login-senha').value;

  try {
    const resposta = await requisicaoApi('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, senha }),
    });
    salvarSessao(resposta);
    mostrarToast(`Bem-vindo(a), ${resposta.nome}! Perfil: ${resposta.papel}`);
    selecionarAba('partidas');
  } catch (erro) {
    mostrarToast(erro.message, 'erro');
  }
}

async function realizarCadastro(evento) {
  evento.preventDefault();
  const nome = document.getElementById('cad-nome').value.trim();
  const email = document.getElementById('cad-email').value.trim();
  const senha = document.getElementById('cad-senha').value;

  try {
    await requisicaoApi('/usuarios', {
      method: 'POST',
      body: JSON.stringify({ nome, email, senha }),
    });
    const loginAuto = await requisicaoApi('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, senha }),
    });
    salvarSessao(loginAuto);
    mostrarToast(`Conta criada! Logado como ${loginAuto.nome} (${loginAuto.papel}).`);
    document.getElementById('form-cadastro').reset();
    selecionarAba('partidas');
  } catch (erro) {
    mostrarToast(erro.message, 'erro');
  }
}

/* ==========================================================================
   3. BUSCA DE PARTIDAS DE HOJE E AMANHÃ NA API EXTERNA (TheSportsDB)
   ========================================================================== */

function obterDataLocalFormatada(diasOffset = 0) {
  const data = new Date();
  data.setDate(data.getDate() + diasOffset);
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function preencherDatasHojeEAmanha() {
  const inputHoje = document.getElementById('filtro-data-hoje');
  const inputAmanha = document.getElementById('filtro-data-amanha');
  const hoje = obterDataLocalFormatada(0);
  const amanha = obterDataLocalFormatada(1);

  if (inputHoje) inputHoje.value = hoje;
  if (inputAmanha) inputAmanha.value = amanha;
  return { hoje, amanha };
}

async function buscarEventosDiaTheSportsDB(dataIso) {
  if (!dataIso) return [];
  const url = `${URL_THESPORTSDB_DIA}?d=${encodeURIComponent(dataIso)}&s=Soccer`;
  const resposta = await fetch(url);
  if (!resposta.ok) {
    throw new Error(`Falha ao consultar TheSportsDB (${resposta.status})`);
  }
  const dados = await resposta.json();
  return Array.isArray(dados.events) ? dados.events : [];
}

async function carregarPartidasExternasHojeEAmanha() {
  const container = document.getElementById('lista-partidas-externas');
  if (!container) return [];

  const data1 = document.getElementById('filtro-data-hoje')?.value || obterDataLocalFormatada(0);
  const data2 = document.getElementById('filtro-data-amanha')?.value || obterDataLocalFormatada(1);

  container.innerHTML = `<p class="texto-vazio">⏳ Consultando partidas de <strong>${data1}</strong> e <strong>${data2}</strong> na TheSportsDB...</p>`;

  try {
    const [eventosDia1, eventosDia2] = await Promise.all([
      buscarEventosDiaTheSportsDB(data1),
      data2 && data2 !== data1 ? buscarEventosDiaTheSportsDB(data2) : Promise.resolve([]),
    ]);

    const mapaUnico = new Map();
    [...eventosDia1, ...eventosDia2].forEach((ev) => {
      if (ev && ev.idEvent && ev.strHomeTeam && ev.strAwayTeam) {
        mapaUnico.set(ev.idEvent, ev);
      }
    });

    const lista = Array.from(mapaUnico.values());

    // Prioriza partidas do Brasil e grandes ligas no topo
    lista.sort((a, b) => {
      const aBrasil = (a.strCountry === 'Brazil' || (a.strLeague || '').includes('Brazil')) ? 0 : 1;
      const bBrasil = (b.strCountry === 'Brazil' || (b.strLeague || '').includes('Brazil')) ? 0 : 1;
      if (aBrasil !== bBrasil) return aBrasil - bBrasil;
      return String(a.dateEvent || '').localeCompare(String(b.dateEvent || ''));
    });

    partidasExternasCache = lista;
    renderizarPartidasExternas(lista, data1);
    return lista;
  } catch (erro) {
    container.innerHTML = `<p class="texto-vazio">❌ Erro ao consultar a TheSportsDB: ${escaparHtml(erro.message)}</p>`;
    return [];
  }
}

/**
 * Converte dateEvent + strTime (que na TheSportsDB vêm sempre em UTC/GMT+0)
 * para o Horário Oficial de Brasília (America/Sao_Paulo, UTC-3).
 * Exemplo: 21:30:00 UTC -> 18:30h (BRT) | 23:30:00 UTC -> 20:30h (BRT).
 */
function converterUtcTheSportsDBParaBrasilia(ev) {
  const dataStr = (ev.dateEvent || obterDataLocalFormatada(0)).trim();
  const horaStr = (ev.strTime || '16:00:00').trim().slice(0, 8);
  const horaNormalizada = /^\d{2}:\d{2}:\d{2}$/.test(horaStr)
    ? horaStr
    : /^\d{2}:\d{2}$/.test(horaStr)
    ? `${horaStr}:00`
    : '16:00:00';

  const dataUtc = new Date(`${dataStr}T${horaNormalizada}Z`);
  if (Number.isNaN(dataUtc.getTime())) {
    return {
      dataBr: dataStr,
      horaBr: `${horaNormalizada.slice(0, 5)}h`,
      isoLocal: `${dataStr}T${horaNormalizada}`,
      dataComparacao: dataStr,
    };
  }

  // Formata no fuso de Brasília (America/Sao_Paulo)
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(dataUtc);

  const mapa = {};
  partes.forEach((p) => {
    mapa[p.type] = p.value;
  });

  const dia = mapa.day || '01';
  const mes = mapa.month || '01';
  const ano = mapa.year || '2026';
  const hora = mapa.hour === '24' ? '00' : mapa.hour || '00';
  const minuto = mapa.minute || '00';
  const segundo = mapa.second || '00';

  return {
    dataBr: `${dia}/${mes}/${ano}`,
    horaBr: `${hora}:${minuto}h (BRT)`,
    isoLocal: `${ano}-${mes}-${dia}T${hora}:${minuto}:${segundo}`,
    dataComparacao: `${ano}-${mes}-${dia}`,
  };
}

function renderizarPartidasExternas(eventos, dataHojeReferencia) {
  const container = document.getElementById('lista-partidas-externas');
  if (!container) return;

  if (!eventos || eventos.length === 0) {
    container.innerHTML = `<p class="texto-vazio">Nenhuma partida de futebol encontrada na TheSportsDB para as datas selecionadas.</p>`;
    return;
  }

  container.innerHTML = eventos
    .map((ev, indice) => {
      const temPlacar =
        ev.intHomeScore !== null &&
        ev.intHomeScore !== undefined &&
        String(ev.intHomeScore).trim() !== '' &&
        ev.intAwayScore !== null &&
        ev.intAwayScore !== undefined &&
        String(ev.intAwayScore).trim() !== '';

      const placarTexto = temPlacar ? `${ev.intHomeScore} x ${ev.intAwayScore}` : 'VS';
      const { dataBr, horaBr, dataComparacao } = converterUtcTheSportsDBParaBrasilia(ev);
      const ehHoje = dataComparacao === dataHojeReferencia || ev.dateEvent === dataHojeReferencia;
      const rotuloDia = ehHoje ? 'HOJE' : 'AMANHÃ';

      let badgeStatus = `<span class="badge badge-info">📅 ${rotuloDia}</span>`;
      if (ev.strStatus === 'FT' || (temPlacar && ev.strStatus !== '1H' && ev.strStatus !== '2H')) {
        badgeStatus = `<span class="badge badge-online">✅ Encerrada</span>`;
      } else if (ev.strStatus === '1H' || ev.strStatus === '2H' || ev.strStatus === 'HT') {
        badgeStatus = `<span class="badge badge-aviso">🔴 Ao Vivo (${ev.strStatus})</span>`;
      }

      const escudoCasa = ev.strHomeTeamBadge || ESCUDO_PADRAO;
      const escudoFora = ev.strAwayTeamBadge || ESCUDO_PADRAO;

      return `
        <article class="card-partida">
          <div class="card-partida-topo">
            <span class="liga-tag" title="${escaparHtml(ev.strLeague || 'Futebol')}">
              🏆 ${escaparHtml(ev.strLeague || 'Futebol Internacional')}
            </span>
            ${badgeStatus}
          </div>

          <div class="confronto">
            <div class="time-bloco">
              <img src="${escaparHtml(escudoCasa)}" alt="${escaparHtml(ev.strHomeTeam)}" class="escudo-time" onerror="this.src='${ESCUDO_PADRAO}'" />
              <span class="nome-time">${escaparHtml(ev.strHomeTeam)}</span>
            </div>

            <div class="placar-central">
              <span class="placar-numero">${escaparHtml(placarTexto)}</span>
              <span class="versus-label">📅 ${escaparHtml(dataBr)}</span>
              <span class="horario-partida">🕒 ${escaparHtml(horaBr)}</span>
            </div>

            <div class="time-bloco">
              <img src="${escaparHtml(escudoFora)}" alt="${escaparHtml(ev.strAwayTeam)}" class="escudo-time" onerror="this.src='${ESCUDO_PADRAO}'" />
              <span class="nome-time">${escaparHtml(ev.strAwayTeam)}</span>
            </div>
          </div>

          <div class="card-partida-rodape">
            <button
              type="button"
              class="btn btn-secundario btn-bloco btn-importar-unica"
              data-indice="${indice}"
            >
              ➕ Adicionar ao Mural da Arena
            </button>
          </div>
        </article>
      `;
    })
    .join('');

  container.querySelectorAll('.btn-importar-unica').forEach((botao) => {
    botao.addEventListener('click', async () => {
      const idx = Number(botao.dataset.indice);
      const ev = partidasExternasCache[idx];
      if (!ev) return;
      botao.disabled = true;
      botao.textContent = '⏳ Importando...';
      try {
        await importarEventoExternoParaArena(ev);
        mostrarToast(`Partida "${ev.strHomeTeam} x ${ev.strAwayTeam}" adicionada ao Mural da Arena!`);
        await carregarPartidasArena();
        botao.textContent = '✅ No Mural da Arena';
      } catch (erro) {
        mostrarToast(erro.message, 'erro');
        botao.disabled = false;
        botao.textContent = '➕ Adicionar ao Mural da Arena';
      }
    });
  });
}

/* ==========================================================================
   4. SINCRONIZAÇÃO / IMPORTAÇÃO DA API EXTERNA PARA O BANCO QUARKUS
   ========================================================================== */

async function garantirTimeNoBanco(nomeTime, escudoUrl, mapaTimesExistentes) {
  const chave = nomeTime.trim().toLowerCase();
  if (mapaTimesExistentes.has(chave)) {
    return mapaTimesExistentes.get(chave);
  }

  const criado = await requisicaoApi('/times', {
    method: 'POST',
    body: JSON.stringify({
      nome: nomeTime.trim(),
      escudoUrl: escudoUrl || null,
    }),
  });
  mapaTimesExistentes.set(chave, criado);
  return criado;
}

function montarDataHoraIso(dateEvent, strTime) {
  const dataLimpa = (dateEvent || obterDataLocalFormatada(0)).trim();
  const horaLimpa = (strTime || '16:00:00').trim().slice(0, 8);
  const horaFormatada = /^\d{2}:\d{2}:\d{2}$/.test(horaLimpa)
    ? horaLimpa
    : /^\d{2}:\d{2}$/.test(horaLimpa)
    ? `${horaLimpa}:00`
    : '16:00:00';
  return `${dataLimpa}T${horaFormatada}`;
}

function eventoExternoJaFinalizado(ev) {
  const temPlacar =
    ev.intHomeScore !== null &&
    ev.intHomeScore !== undefined &&
    String(ev.intHomeScore).trim() !== '' &&
    ev.intAwayScore !== null &&
    ev.intAwayScore !== undefined &&
    String(ev.intAwayScore).trim() !== '';

  const emAndamento = ev.strStatus === '1H' || ev.strStatus === '2H' || ev.strStatus === 'HT';
  return ev.strStatus === 'FT' || (temPlacar && !emAndamento);
}

async function importarEventoExternoParaArena(ev, cacheContexto = null) {
  const timesAtuais = cacheContexto?.times || (await requisicaoApi('/times?pagina=0&tamanho=100'));
  const partidasAtuais = cacheContexto?.partidas || (await requisicaoApi('/partidas?pagina=0&tamanho=100'));

  const mapaTimes = cacheContexto?.mapaTimes || new Map();
  if (mapaTimes.size === 0 && Array.isArray(timesAtuais)) {
    timesAtuais.forEach((t) => mapaTimes.set(t.nome.trim().toLowerCase(), t));
  }

  const timeCasa = await garantirTimeNoBanco(ev.strHomeTeam, ev.strHomeTeamBadge, mapaTimes);
  const timeFora = await garantirTimeNoBanco(ev.strAwayTeam, ev.strAwayTeamBadge, mapaTimes);

  const { isoLocal } = converterUtcTheSportsDBParaBrasilia(ev);
  const jaFinalizada = eventoExternoJaFinalizado(ev);
  const placarReal = jaFinalizada
    ? `${String(ev.intHomeScore).trim()}x${String(ev.intAwayScore).trim()}`
    : null;
  const statusReal = jaFinalizada ? 'FINALIZADA' : 'AGENDADA';

  // Verifica se já existe partida entre os mesmos times
  const partidaExistente = (partidasAtuais || []).find(
    (p) => p.timeCasa?.id === timeCasa.id && p.timeFora?.id === timeFora.id
  );
  if (partidaExistente) {
    // Se a partida estava AGENDADA no banco mas já terminou na API externa, atualiza para FINALIZADA com o placar real
    if (jaFinalizada && partidaExistente.status !== 'FINALIZADA') {
      const atualizada = await requisicaoApi(`/partidas/${partidaExistente.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          timeCasaId: timeCasa.id,
          timeForaId: timeFora.id,
          data: isoLocal,
          placar: placarReal,
          status: 'FINALIZADA',
        }),
      });
      Object.assign(partidaExistente, atualizada);
      return atualizada;
    }
    return null;
  }

  const novaPartida = await requisicaoApi('/partidas', {
    method: 'POST',
    body: JSON.stringify({
      timeCasaId: timeCasa.id,
      timeForaId: timeFora.id,
      data: isoLocal,
      ...(placarReal ? { placar: placarReal } : {}),
      status: statusReal,
    }),
  });

  if (Array.isArray(partidasAtuais)) {
    partidasAtuais.push(novaPartida);
  }
  return novaPartida;
}

async function importarTodasPartidasExternas(silencioso = false) {
  if (!partidasExternasCache || partidasExternasCache.length === 0) {
    if (!silencioso) mostrarToast('Nenhuma partida externa carregada para importar.', 'erro');
    return;
  }

  const btn = document.getElementById('btn-importar-todas');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Importando para a Arena...';
  }

  try {
    const times = await requisicaoApi('/times?pagina=0&tamanho=100');
    const partidas = await requisicaoApi('/partidas?pagina=0&tamanho=100');
    const mapaTimes = new Map();
    (times || []).forEach((t) => mapaTimes.set(t.nome.trim().toLowerCase(), t));

    let importadas = 0;
    for (const ev of partidasExternasCache) {
      const criada = await importarEventoExternoParaArena(ev, { times, partidas, mapaTimes });
      if (criada) importadas++;
    }

    if (!silencioso) {
      if (importadas > 0) {
        mostrarToast(`${importadas} partida(s) de Hoje/Amanhã importada(s) para o Mural da Arena!`);
      } else {
        mostrarToast('Todas as partidas de Hoje/Amanhã já estão no Mural da Arena.');
      }
    }
    await carregarPartidasArena();
  } catch (erro) {
    if (!silencioso) {
      mostrarToast(`Não foi possível importar: ${erro.message}`, 'erro');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '📥 Importar Todas para a Arena';
    }
  }
}

/* ==========================================================================
   5. MURAL DE PARTIDAS DO BANCO (GET /partidas + POST /palpites + /apurar)
   ========================================================================== */

async function carregarPartidasArena() {
  const container = document.getElementById('lista-partidas-arena');
  if (!container) return [];

  const filtroStatus = document.getElementById('filtro-status-arena')?.value || '';
  const queryStatus = filtroStatus ? `&status=${encodeURIComponent(filtroStatus)}` : '';

  try {
    const partidas = await requisicaoApi(`/partidas?pagina=0&tamanho=100${queryStatus}`);
    renderizarPartidasArena(partidas || []);
    return partidas || [];
  } catch (erro) {
    container.innerHTML = `
      <p class="texto-vazio">
        ⚠️ API Quarkus offline no momento. As partidas de Hoje e Amanhã já estão visíveis acima via TheSportsDB!
        Assim que subir a API (<code>docker compose up --build</code> ou <code>quarkusDev</code>), clique em <strong>Atualizar Mural</strong>.
      </p>
    `;
    return [];
  }
}

function formatarDataHoraBr(dataIso) {
  if (!dataIso) return '';
  try {
    const d = new Date(dataIso);
    if (Number.isNaN(d.getTime())) return dataIso;
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dataIso;
  }
}

function extrairDataEHoraArena(dataIso) {
  if (!dataIso) return { data: '', hora: '' };
  try {
    const d = new Date(dataIso);
    if (Number.isNaN(d.getTime())) return { data: dataIso, hora: '' };
    const data = d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const hora =
      d.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      }) + 'h';
    return { data, hora };
  } catch {
    return { data: dataIso, hora: '' };
  }
}

function renderizarPartidasArena(partidas) {
  const container = document.getElementById('lista-partidas-arena');
  if (!container) return;

  if (!partidas || partidas.length === 0) {
    container.innerHTML = `
      <p class="texto-vazio">
        Nenhuma partida cadastrada no banco com este filtro. Clique em <strong>"📥 Importar Todas para a Arena"</strong> no painel acima para trazer os jogos de Hoje e Amanhã!
      </p>
    `;
    return;
  }

  container.innerHTML = partidas
    .map((p) => {
      const nomeCasa = p.timeCasa?.nome || 'Time Casa';
      const nomeFora = p.timeFora?.nome || 'Time Fora';
      const escudoCasa = p.timeCasa?.escudoUrl || ESCUDO_PADRAO;
      const escudoFora = p.timeFora?.escudoUrl || ESCUDO_PADRAO;
      const finalizada = p.status === 'FINALIZADA';
      const placarExibicao = p.placar ? p.placar.replace('x', ' x ') : 'VS';
      const { data: dataBr, hora: horaBr } = extrairDataEHoraArena(p.data);

      const badgeStatus = finalizada
        ? `<span class="badge badge-online">✅ FINALIZADA</span>`
        : `<span class="badge badge-aviso">⏳ AGENDADA</span>`;

      const rodapePartida = !finalizada
        ? `
          <form class="form-palpite-rapido" data-partida-id="${p.id}">
            <div class="placar-inputs">
              <input type="number" min="0" max="99" required placeholder="0" class="input-padrao input-gols" name="golsCasa" />
              <span class="versus-label">x</span>
              <input type="number" min="0" max="99" required placeholder="0" class="input-padrao input-gols" name="golsFora" />
            </div>
            <button type="submit" class="btn btn-primario btn-pequeno">🎯 Palpitar</button>
          </form>
          <button
            type="button"
            class="btn btn-grpc btn-apurar-partida"
            data-partida-id="${p.id}"
            data-descricao="${escaparHtml(nomeCasa)} x ${escaparHtml(nomeFora)}"
          >
            ⚡ Apurar Resultado na API Externa (Go + gRPC)
          </button>
        `
        : `
          <div class="aviso-partida-encerrada">
            🔒 Partida encerrada — palpites fechados (Placar Oficial: <strong>${escaparHtml(placarExibicao)}</strong>)
          </div>
        `;

      return `
        <article class="card-partida">
          <div class="card-partida-topo">
            <span class="liga-tag">Partida #${p.id} • 📅 ${escaparHtml(dataBr)}</span>
            ${badgeStatus}
          </div>

          <div class="confronto">
            <div class="time-bloco">
              <img src="${escaparHtml(escudoCasa)}" alt="${escaparHtml(nomeCasa)}" class="escudo-time" onerror="this.src='${ESCUDO_PADRAO}'" />
              <span class="nome-time">${escaparHtml(nomeCasa)}</span>
            </div>

            <div class="placar-central">
              <span class="placar-numero">${escaparHtml(placarExibicao)}</span>
              <span class="versus-label">📅 ${escaparHtml(dataBr)}</span>
              <span class="horario-partida">🕒 ${escaparHtml(horaBr)}</span>
            </div>

            <div class="time-bloco">
              <img src="${escaparHtml(escudoFora)}" alt="${escaparHtml(nomeFora)}" class="escudo-time" onerror="this.src='${ESCUDO_PADRAO}'" />
              <span class="nome-time">${escaparHtml(nomeFora)}</span>
            </div>
          </div>

          <div class="card-partida-rodape">
            ${rodapePartida}
          </div>
        </article>
      `;
    })
    .join('');

  // Eventos de envio de palpite rápido
  container.querySelectorAll('.form-palpite-rapido').forEach((form) => {
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const sessao = obterSessao();
      if (!sessao || !sessao.usuarioId) {
        mostrarToast('Faça login ou cadastre-se primeiro para registrar seu palpite!', 'erro');
        selecionarAba('auth');
        return;
      }

      const partidaId = Number(form.dataset.partidaId);
      const golsCasa = form.elements.golsCasa.value.trim();
      const golsFora = form.elements.golsFora.value.trim();
      const placarprevisto = `${golsCasa}x${golsFora}`;

      try {
        await requisicaoApi('/palpites', {
          method: 'POST',
          body: JSON.stringify({
            usuarioId: sessao.usuarioId,
            partidaId,
            placarprevisto,
          }),
        });
        mostrarToast(`Palpite ${placarprevisto} registrado com sucesso na Partida #${partidaId}!`);
        form.reset();
        carregarMeusPalpites();
      } catch (erro) {
        mostrarToast(erro.message, 'erro');
      }
    });
  });

  // Eventos do botão de apuração externa via Go + gRPC
  container.querySelectorAll('.btn-apurar-partida').forEach((botao) => {
    botao.addEventListener('click', async () => {
      const partidaId = Number(botao.dataset.partidaId);
      const descricao = botao.dataset.descricao || `Partida #${partidaId}`;
      const textoOriginal = botao.textContent;

      botao.disabled = true;
      botao.textContent = '⏳ Consultando Go + gRPC + TheSportsDB...';

      try {
        const partidaApurada = await requisicaoApi(`/partidas/${partidaId}/apurar`, {
          method: 'POST',
        });
        mostrarToast(
          `Resultado apurado para ${descricao}: ${partidaApurada.placar}! Palpites pontuados e notificações enviadas.`
        );
        await carregarPartidasArena();
        await carregarMeusPalpites();
      } catch (erro) {
        mostrarToast(erro.message, 'erro');
        botao.disabled = false;
        botao.textContent = textoOriginal;
      }
    });
  });
}

/* ==========================================================================
   5.5. ABA 3: MEUS PALPITES (GET /palpites, PUT /palpites/{id}, DELETE /palpites/{id})
   ========================================================================== */

function atualizarResumoPalpites(palpites) {
  const lista = Array.isArray(palpites) ? palpites : [];
  const totalPalpites = lista.length;
  let totalPontos = 0;
  let cravadas = 0;
  let pendentes = 0;

  lista.forEach((palpite) => {
    const pts = Number(palpite.pontosObtidos || 0);
    totalPontos += pts;
    if (pts === 3) cravadas++;
    if (palpite.partida?.status !== 'FINALIZADA') pendentes++;
  });

  const elTotal = document.getElementById('stat-total-palpites');
  const elPontos = document.getElementById('stat-total-pontos');
  const elCravadas = document.getElementById('stat-cravadas');
  const elPendentes = document.getElementById('stat-pendentes');

  if (elTotal) elTotal.textContent = String(totalPalpites);
  if (elPontos) elPontos.textContent = `${totalPontos} pts`;
  if (elCravadas) elCravadas.textContent = String(cravadas);
  if (elPendentes) elPendentes.textContent = String(pendentes);
}

async function carregarMeusPalpites() {
  const container = document.getElementById('lista-meus-palpites');
  if (!container) return [];

  const escopo = document.getElementById('filtro-escopo-palpites')?.value || 'meus';
  const sessao = obterSessao();

  if (escopo === 'meus' && (!sessao || !sessao.usuarioId)) {
    atualizarResumoPalpites([]);
    container.innerHTML = `
      <div class="texto-vazio">
        <p style="margin-bottom: 12px;">🔐 Você ainda não está autenticado para filtrar <strong>Meus Palpites</strong>.</p>
        <button type="button" id="btn-ir-login-palpites" class="btn btn-primario">
          Entrar / Criar Conta Agora
        </button>
      </div>
    `;
    document.getElementById('btn-ir-login-palpites')?.addEventListener('click', () => {
      selecionarAba('auth');
    });
    return [];
  }

  const queryUsuario =
    escopo === 'meus' && sessao?.usuarioId
      ? `&usuarioId=${encodeURIComponent(sessao.usuarioId)}`
      : '';

  try {
    const palpites = await requisicaoApi(`/palpites?pagina=0&tamanho=100${queryUsuario}`);
    const lista = Array.isArray(palpites) ? palpites : [];
    atualizarResumoPalpites(lista);
    renderizarMeusPalpites(lista);
    return lista;
  } catch (erro) {
    atualizarResumoPalpites([]);
    container.innerHTML = `
      <p class="texto-vazio">
        ⚠️ Não foi possível carregar os palpites (${escaparHtml(erro.message)}). Verifique se a API Quarkus está rodando na porta 8080.
      </p>
    `;
    return [];
  }
}

function renderizarMeusPalpites(palpites) {
  const container = document.getElementById('lista-meus-palpites');
  if (!container) return;

  if (!palpites || palpites.length === 0) {
    container.innerHTML = `
      <p class="texto-vazio">
        🎯 Nenhum palpite encontrado. Vá na aba <strong>"🏟️ Partidas &amp; Apuração"</strong> e registre seu primeiro palpite!
      </p>
    `;
    return;
  }

  container.innerHTML = palpites
    .map((palpite) => {
      const partida = palpite.partida || {};
      const nomeCasa = partida.timeCasa?.nome || 'Time Casa';
      const nomeFora = partida.timeFora?.nome || 'Time Fora';
      const escudoCasa = partida.timeCasa?.escudoUrl || ESCUDO_PADRAO;
      const escudoFora = partida.timeFora?.escudoUrl || ESCUDO_PADRAO;
      const finalizada = partida.status === 'FINALIZADA';
      const { data: dataBr, hora: horaBr } = extrairDataEHoraArena(partida.data);

      const placarPrevisto = palpite.placarprevisto || '0x0';
      const [golsCasaPrev = '0', golsForaPrev = '0'] = placarPrevisto.split('x');
      const placarOficial = partida.placar ? partida.placar.replace('x', ' x ') : 'Aguardando';
      const pts = Number(palpite.pontosObtidos || 0);
      const nomeTorcedor = palpite.usuario?.nome || 'Torcedor';

      let badgePontos = `<span class="badge badge-aviso">⏳ Aguardando Jogo</span>`;
      if (finalizada) {
        if (pts === 3) {
          badgePontos = `<span class="badge badge-online">🎯 +3 pts (Placar Exato!)</span>`;
        } else if (pts === 1) {
          badgePontos = `<span class="badge badge-info">✅ +1 pt (Vencedor/Empate)</span>`;
        } else {
          badgePontos = `<span class="badge badge-offline">❌ 0 pts</span>`;
        }
      }

      return `
        <article class="card-partida">
          <div class="card-partida-topo">
            <span class="liga-tag" title="Torcedor: ${escaparHtml(nomeTorcedor)}">
              Palpite #${palpite.id} • 👤 ${escaparHtml(nomeTorcedor)}
            </span>
            ${badgePontos}
          </div>

          <div class="confronto">
            <div class="time-bloco">
              <img src="${escaparHtml(escudoCasa)}" alt="${escaparHtml(nomeCasa)}" class="escudo-time" onerror="this.src='${ESCUDO_PADRAO}'" />
              <span class="nome-time">${escaparHtml(nomeCasa)}</span>
            </div>

            <div class="placar-central">
              <span class="placar-numero">${escaparHtml(placarPrevisto.replace('x', ' x '))}</span>
              <span class="versus-label">📅 ${escaparHtml(dataBr)}</span>
              <span class="horario-partida">🕒 ${escaparHtml(horaBr)}</span>
            </div>

            <div class="time-bloco">
              <img src="${escaparHtml(escudoFora)}" alt="${escaparHtml(nomeFora)}" class="escudo-time" onerror="this.src='${ESCUDO_PADRAO}'" />
              <span class="nome-time">${escaparHtml(nomeFora)}</span>
            </div>
          </div>

          <div class="comparativo-placares">
            <div class="caixa-placar-info">
              <span>🎯 Seu Palpite</span>
              <strong class="destaque-azul">${escaparHtml(placarPrevisto.replace('x', ' x '))}</strong>
            </div>
            <div class="caixa-placar-info">
              <span>🏟️ Placar Oficial</span>
              <strong class="${finalizada ? 'destaque-verde' : ''}">${escaparHtml(placarOficial)}</strong>
            </div>
          </div>

          <div class="card-partida-rodape">
            ${
              !finalizada
                ? `
            <form class="acoes-palpite-card form-editar-palpite" data-palpite-id="${palpite.id}">
              <div class="placar-inputs">
                <input
                  type="number"
                  min="0"
                  max="99"
                  required
                  value="${escaparHtml(golsCasaPrev)}"
                  class="input-padrao input-gols"
                  name="golsCasa"
                />
                <span class="versus-label">x</span>
                <input
                  type="number"
                  min="0"
                  max="99"
                  required
                  value="${escaparHtml(golsForaPrev)}"
                  class="input-padrao input-gols"
                  name="golsFora"
                />
              </div>
              <div style="display: flex; gap: 6px;">
                <button type="submit" class="btn btn-info btn-pequeno" title="Atualizar placar previsto (PUT /palpites/${palpite.id})">
                  💾 Salvar
                </button>
                <button
                  type="button"
                  class="btn btn-perigo btn-pequeno btn-excluir-palpite"
                  data-palpite-id="${palpite.id}"
                  title="Remover palpite (DELETE /palpites/${palpite.id})"
                >
                  🗑️ Excluir
                </button>
              </div>
            </form>`
                : `
            <div class="aviso-partida-encerrada">
              🔒 Partida finalizada — palpite consolidado (${pts} ${pts === 1 ? 'ponto' : 'pontos'})
            </div>`
            }
          </div>
        </article>
      `;
    })
    .join('');

  // Eventos de atualização de palpite (PUT /palpites/{id})
  container.querySelectorAll('.form-editar-palpite').forEach((form) => {
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const palpiteId = Number(form.dataset.palpiteId);
      const golsCasa = form.elements.golsCasa.value.trim();
      const golsFora = form.elements.golsFora.value.trim();
      const placarprevisto = `${golsCasa}x${golsFora}`;

      try {
        await requisicaoApi(`/palpites/${palpiteId}`, {
          method: 'PUT',
          body: JSON.stringify({ placarprevisto }),
        });
        mostrarToast(`Palpite #${palpiteId} atualizado para ${placarprevisto}!`);
        await carregarMeusPalpites();
      } catch (erro) {
        mostrarToast(erro.message, 'erro');
      }
    });
  });

  // Eventos de exclusão de palpite (DELETE /palpites/{id})
  container.querySelectorAll('.btn-excluir-palpite').forEach((botao) => {
    botao.addEventListener('click', async () => {
      const palpiteId = Number(botao.dataset.palpiteId);
      botao.disabled = true;
      try {
        await requisicaoApi(`/palpites/${palpiteId}`, {
          method: 'DELETE',
        });
        mostrarToast(`Palpite #${palpiteId} removido com sucesso!`);
        await carregarMeusPalpites();
      } catch (erro) {
        mostrarToast(erro.message, 'erro');
        botao.disabled = false;
      }
    });
  });
}

/* ==========================================================================
   5.6. ABA 4: RANKING DE TORCEDORES (GET /usuarios/ranking)
   ========================================================================== */

async function carregarRanking() {
  const tbody = document.getElementById('corpo-tabela-ranking');
  if (!tbody) return [];

  try {
    const usuarios = await requisicaoApi('/usuarios/ranking?pagina=0&tamanho=100');
    const lista = Array.isArray(usuarios) ? usuarios : [];

    if (lista.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="texto-vazio">
            Nenhum torcedor cadastrado ainda. Crie uma conta na aba <strong>"🔐 Entrar / Cadastrar"</strong>!
          </td>
        </tr>
      `;
      return [];
    }

    const sessao = obterSessao();
    const medalhas = ['🥇 1º', '🥈 2º', '🥉 3º'];

    tbody.innerHTML = lista
      .map((u, idx) => {
        const posicao = medalhas[idx] || `${idx + 1}º`;
        const ehUsuarioAtual = sessao && Number(sessao.usuarioId) === Number(u.id);
        const classeLinha = ehUsuarioAtual ? 'linha-usuario-atual' : '';
        const tagVoce = ehUsuarioAtual ? ' <span class="badge badge-online">Você</span>' : '';
        const pts = Number(u.pontuacaoTotal || 0);

        return `
          <tr class="${classeLinha}">
            <td><strong>${posicao}</strong></td>
            <td><strong>${escaparHtml(u.nome)}</strong>${tagVoce}</td>
            <td>${escaparHtml(u.email)}</td>
            <td class="col-direita">
              <span class="pontos-pill">${pts} ${pts === 1 ? 'ponto' : 'pontos'}</span>
            </td>
          </tr>
        `;
      })
      .join('');

    return lista;
  } catch (erro) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="texto-vazio">
          ⚠️ Erro ao carregar ranking (${escaparHtml(erro.message)}). Verifique se a API Quarkus está rodando.
        </td>
      </tr>
    `;
    return [];
  }
}

/* ==========================================================================
   5.7. ABA 5: PAINEL ADMINISTRATIVO (Times e Partidas)
   ========================================================================== */

function atualizarAvisoPermissaoAdmin() {
  const banner = document.getElementById('aviso-permissao-admin');
  if (!banner) return;

  const sessao = obterSessao();
  if (sessao && sessao.papel === 'ADMIN') {
    banner.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
        <div>
          <h2>✅ Modo Administrador Ativo (${escaparHtml(sessao.nome)})</h2>
          <p>Você está autenticado com perfil <strong>ADMIN</strong> e possui acesso completo ao gerenciamento manual de clubes e partidas.</p>
        </div>
        <span class="badge badge-info">PERFIL ADMIN</span>
      </div>
    `;
  } else {
    banner.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
        <div>
          <h2>ℹ️ Dica de Perfil Administrador</h2>
          <p>Para testar o fluxo com perfil <strong>ADMIN</strong>, entre com um e-mail iniciado por <code>admin@</code> (ex.: <code>admin@arenapro.com</code>). Os endpoints abaixo também estão liberados para seus testes locais.</p>
        </div>
        <button type="button" id="btn-ir-auth-admin" class="btn btn-secundario btn-pequeno">
          Ir para Login / Cadastro
        </button>
      </div>
    `;
    document.getElementById('btn-ir-auth-admin')?.addEventListener('click', () => selecionarAba('auth'));
  }
}

async function carregarPainelAdmin() {
  atualizarAvisoPermissaoAdmin();

  const selectCasa = document.getElementById('partida-casa');
  const selectFora = document.getElementById('partida-fora');
  const containerTimes = document.getElementById('lista-times-admin');
  const containerPartidas = document.getElementById('lista-partidas-admin');

  // Preenche data/hora padrão no formulário de nova partida se estiver vazio
  const inputData = document.getElementById('partida-data');
  if (inputData && !inputData.value) {
    inputData.value = `${obterDataLocalFormatada(1)}T16:00`;
  }

  try {
    const [times, partidas] = await Promise.all([
      requisicaoApi('/times?pagina=0&tamanho=100'),
      requisicaoApi('/partidas?pagina=0&tamanho=100'),
    ]);

    const listaTimes = Array.isArray(times) ? times : [];
    const listaPartidas = Array.isArray(partidas) ? partidas : [];

    // Popula selects de Time da Casa e Time de Fora
    const opcoesHtml =
      `<option value="">Selecione um time...</option>` +
      listaTimes
        .map((t) => `<option value="${t.id}">${escaparHtml(t.nome)} (#${t.id})</option>`)
        .join('');

    if (selectCasa) selectCasa.innerHTML = opcoesHtml;
    if (selectFora) selectFora.innerHTML = opcoesHtml;

    // Renderiza lista de Times com botão de excluir
    if (containerTimes) {
      if (listaTimes.length === 0) {
        containerTimes.innerHTML = `<p class="texto-vazio">Nenhum time cadastrado no banco.</p>`;
      } else {
        containerTimes.innerHTML = listaTimes
          .map((t) => {
            const escudo = t.escudoUrl || ESCUDO_PADRAO;
            return `
              <div class="card-time-admin">
                <div class="info-time-admin">
                  <img src="${escaparHtml(escudo)}" alt="${escaparHtml(t.nome)}" class="escudo-time" style="width:32px;height:32px;" onerror="this.src='${ESCUDO_PADRAO}'" />
                  <span title="${escaparHtml(t.nome)}">${escaparHtml(t.nome)}</span>
                </div>
                <button
                  type="button"
                  class="btn btn-perigo btn-pequeno btn-remover-time"
                  data-time-id="${t.id}"
                  data-time-nome="${escaparHtml(t.nome)}"
                  title="Remover Time (DELETE /times/${t.id})"
                >
                  🗑️
                </button>
              </div>
            `;
          })
          .join('');

        containerTimes.querySelectorAll('.btn-remover-time').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = Number(btn.dataset.timeId);
            const nome = btn.dataset.timeNome;
            btn.disabled = true;
            try {
              await requisicaoApi(`/times/${id}`, { method: 'DELETE' });
              mostrarToast(`Time "${nome}" removido com sucesso!`);
              await carregarPainelAdmin();
            } catch (erro) {
              mostrarToast(erro.message, 'erro');
              btn.disabled = false;
            }
          });
        });
      }
    }

    // Renderiza lista de Partidas para encerramento manual ou exclusão
    if (containerPartidas) {
      if (listaPartidas.length === 0) {
        containerPartidas.innerHTML = `<p class="texto-vazio">Nenhuma partida cadastrada no banco.</p>`;
      } else {
        containerPartidas.innerHTML = listaPartidas
          .map((p) => {
            const nomeCasa = p.timeCasa?.nome || 'Time Casa';
            const nomeFora = p.timeFora?.nome || 'Time Fora';
            const escudoCasa = p.timeCasa?.escudoUrl || ESCUDO_PADRAO;
            const escudoFora = p.timeFora?.escudoUrl || ESCUDO_PADRAO;
            const finalizada = p.status === 'FINALIZADA';
            const [golsCasaAtual = '0', golsForaAtual = '0'] = (p.placar || '0x0').split('x');
            const { data: dataBr, hora: horaBr } = extrairDataEHoraArena(p.data);

            return `
              <article class="card-partida">
                <div class="card-partida-topo">
                  <span class="liga-tag">Partida #${p.id} • 📅 ${escaparHtml(dataBr)} (${escaparHtml(horaBr)})</span>
                  <span class="badge ${finalizada ? 'badge-online' : 'badge-aviso'}">${p.status}</span>
                </div>

                <div class="confronto">
                  <div class="time-bloco">
                    <img src="${escaparHtml(escudoCasa)}" alt="${escaparHtml(nomeCasa)}" class="escudo-time" onerror="this.src='${ESCUDO_PADRAO}'" />
                    <span class="nome-time">${escaparHtml(nomeCasa)}</span>
                  </div>
                  <div class="placar-central">
                    <span class="placar-numero">${escaparHtml(p.placar ? p.placar.replace('x', ' x ') : 'VS')}</span>
                    <span class="versus-label">${finalizada ? 'Finalizada' : 'Agendada'}</span>
                  </div>
                  <div class="time-bloco">
                    <img src="${escaparHtml(escudoFora)}" alt="${escaparHtml(nomeFora)}" class="escudo-time" onerror="this.src='${ESCUDO_PADRAO}'" />
                    <span class="nome-time">${escaparHtml(nomeFora)}</span>
                  </div>
                </div>

                <div class="card-partida-rodape">
                  <form
                    class="acoes-palpite-card form-finalizar-manual"
                    data-partida-id="${p.id}"
                    data-casa-id="${p.timeCasa?.id}"
                    data-fora-id="${p.timeFora?.id}"
                    data-iso="${escaparHtml(p.data)}"
                  >
                    <div class="placar-inputs">
                      <input type="number" min="0" max="99" required value="${escaparHtml(golsCasaAtual)}" class="input-padrao input-gols" name="golsCasa" />
                      <span class="versus-label">x</span>
                      <input type="number" min="0" max="99" required value="${escaparHtml(golsForaAtual)}" class="input-padrao input-gols" name="golsFora" />
                    </div>
                    <div style="display: flex; gap: 6px;">
                      <button type="submit" class="btn btn-primario btn-pequeno" title="Salvar placar oficial e finalizar partida (PUT /partidas/${p.id})">
                        ✅ Finalizar
                      </button>
                      <button
                        type="button"
                        class="btn btn-perigo btn-pequeno btn-remover-partida"
                        data-partida-id="${p.id}"
                        title="Excluir partida (DELETE /partidas/${p.id})"
                      >
                        🗑️
                      </button>
                    </div>
                  </form>
                </div>
              </article>
            `;
          })
          .join('');

        // Eventos para finalizar partida manualmente (PUT /partidas/{id})
        containerPartidas.querySelectorAll('.form-finalizar-manual').forEach((form) => {
          form.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const id = Number(form.dataset.partidaId);
            const timeCasaId = Number(form.dataset.casaId);
            const timeForaId = Number(form.dataset.foraId);
            const dataIso = form.dataset.iso;
            const golsCasa = form.elements.golsCasa.value.trim();
            const golsFora = form.elements.golsFora.value.trim();
            const placar = `${golsCasa}x${golsFora}`;

            try {
              await requisicaoApi(`/partidas/${id}`, {
                method: 'PUT',
                body: JSON.stringify({
                  timeCasaId,
                  timeForaId,
                  data: dataIso,
                  placar,
                  status: 'FINALIZADA',
                }),
              });
              mostrarToast(`Partida #${id} finalizada com placar ${placar}! Pontos calculados e notificações enviadas.`);
              await carregarPainelAdmin();
              await carregarPartidasArena();
            } catch (erro) {
              mostrarToast(erro.message, 'erro');
            }
          });
        });

        // Eventos para remover partida (DELETE /partidas/{id})
        containerPartidas.querySelectorAll('.btn-remover-partida').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = Number(btn.dataset.partidaId);
            btn.disabled = true;
            try {
              await requisicaoApi(`/partidas/${id}`, { method: 'DELETE' });
              mostrarToast(`Partida #${id} removida com sucesso!`);
              await carregarPainelAdmin();
              await carregarPartidasArena();
            } catch (erro) {
              mostrarToast(erro.message, 'erro');
              btn.disabled = false;
            }
          });
        });
      }
    }
  } catch (erro) {
    if (containerPartidas) {
      containerPartidas.innerHTML = `<p class="texto-vazio">⚠️ API Quarkus offline (${escaparHtml(erro.message)}).</p>`;
    }
  }
}

async function criarTimeManual(evento) {
  evento.preventDefault();
  const nome = document.getElementById('time-nome').value.trim();
  const escudoUrl = document.getElementById('time-escudo').value.trim() || null;

  try {
    const criado = await requisicaoApi('/times', {
      method: 'POST',
      body: JSON.stringify({ nome, escudoUrl }),
    });
    mostrarToast(`Time "${criado.nome}" cadastrado com sucesso!`);
    document.getElementById('form-criar-time').reset();
    await carregarPainelAdmin();
  } catch (erro) {
    mostrarToast(erro.message, 'erro');
  }
}

async function criarPartidaManual(evento) {
  evento.preventDefault();
  const timeCasaId = Number(document.getElementById('partida-casa').value);
  const timeForaId = Number(document.getElementById('partida-fora').value);
  const dataBruta = document.getElementById('partida-data').value;
  const data = dataBruta.length === 16 ? `${dataBruta}:00` : dataBruta;

  try {
    const criada = await requisicaoApi('/partidas', {
      method: 'POST',
      body: JSON.stringify({
        timeCasaId,
        timeForaId,
        data,
        status: 'AGENDADA',
      }),
    });
    mostrarToast(`Partida #${criada.id} criada e agendada no Mural da Arena!`);
    await carregarPainelAdmin();
    await carregarPartidasArena();
  } catch (erro) {
    mostrarToast(erro.message, 'erro');
  }
}

function escaparHtml(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ==========================================================================
   6. INICIALIZAÇÃO
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
  // Navegação entre abas
  document.querySelectorAll('.aba-btn').forEach((botao) => {
    botao.addEventListener('click', () => selecionarAba(botao.dataset.aba));
  });

  // Formulários de Autenticação e Cadastro
  document.getElementById('form-login')?.addEventListener('submit', realizarLogin);
  document.getElementById('form-cadastro')?.addEventListener('submit', realizarCadastro);

  // Botões da seção de Partidas Externas (TheSportsDB)
  document.getElementById('btn-hoje-amanha')?.addEventListener('click', async () => {
    preencherDatasHojeEAmanha();
    await carregarPartidasExternasHojeEAmanha();
  });

  document.getElementById('btn-buscar-externas')?.addEventListener('click', async () => {
    await carregarPartidasExternasHojeEAmanha();
  });

  document.getElementById('btn-importar-todas')?.addEventListener('click', async () => {
    await importarTodasPartidasExternas(false);
  });

  // Botões do Mural da Arena
  document.getElementById('btn-recarregar-arena')?.addEventListener('click', carregarPartidasArena);
  document.getElementById('filtro-status-arena')?.addEventListener('change', carregarPartidasArena);

  // Botões da Aba 3 — Meus Palpites
  document.getElementById('btn-recarregar-palpites')?.addEventListener('click', carregarMeusPalpites);
  document.getElementById('filtro-escopo-palpites')?.addEventListener('change', carregarMeusPalpites);

  // Botões da Aba 4 — Ranking
  document.getElementById('btn-recarregar-ranking')?.addEventListener('click', carregarRanking);

  // Formulários e Botões da Aba 5 — Painel Admin
  document.getElementById('form-criar-time')?.addEventListener('submit', criarTimeManual);
  document.getElementById('form-criar-partida')?.addEventListener('submit', criarPartidaManual);
  document.getElementById('btn-recarregar-admin')?.addEventListener('click', carregarPainelAdmin);

  // Inicializa cabeçalho e datas de Hoje e Amanhã
  atualizarCabecalhoUsuario();
  preencherDatasHojeEAmanha();

  // 1) Carrega as partidas reais de Hoje e Amanhã da TheSportsDB imediatamente
  const externas = await carregarPartidasExternasHojeEAmanha();

  // 2) Verifica se a API Quarkus está online e carrega o Mural do Banco
  const online = await verificarStatusApi();
  if (online) {
    await validarSessaoExistenteNoBanco();
    const partidasNoBanco = await carregarPartidasArena();
    // Se o banco estiver vazio, sincroniza automaticamente as partidas de Hoje e Amanhã para o Mural!
    if (partidasNoBanco.length === 0 && externas.length > 0) {
      await importarTodasPartidasExternas(true);
    }
  } else {
    await carregarPartidasArena();
  }
});
