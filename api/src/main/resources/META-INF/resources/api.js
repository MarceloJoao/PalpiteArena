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

async function importarEventoExternoParaArena(ev, cacheContexto = null) {
  const timesAtuais = cacheContexto?.times || (await requisicaoApi('/times?pagina=0&tamanho=100'));
  const partidasAtuais = cacheContexto?.partidas || (await requisicaoApi('/partidas?pagina=0&tamanho=100'));

  const mapaTimes = cacheContexto?.mapaTimes || new Map();
  if (mapaTimes.size === 0 && Array.isArray(timesAtuais)) {
    timesAtuais.forEach((t) => mapaTimes.set(t.nome.trim().toLowerCase(), t));
  }

  const timeCasa = await garantirTimeNoBanco(ev.strHomeTeam, ev.strHomeTeamBadge, mapaTimes);
  const timeFora = await garantirTimeNoBanco(ev.strAwayTeam, ev.strAwayTeamBadge, mapaTimes);

  // Verifica se já existe partida entre os mesmos times
  const jaExiste = (partidasAtuais || []).some(
    (p) => p.timeCasa?.id === timeCasa.id && p.timeFora?.id === timeFora.id
  );
  if (jaExiste) {
    return null;
  }

  const { isoLocal } = converterUtcTheSportsDBParaBrasilia(ev);

  const novaPartida = await requisicaoApi('/partidas', {
    method: 'POST',
    body: JSON.stringify({
      timeCasaId: timeCasa.id,
      timeForaId: timeFora.id,
      data: isoLocal,
      status: 'AGENDADA',
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

      const blocoPalpite = !finalizada
        ? `
          <form class="form-palpite-rapido" data-partida-id="${p.id}">
            <div class="placar-inputs">
              <input type="number" min="0" max="99" required placeholder="0" class="input-padrao input-gols" name="golsCasa" />
              <span class="versus-label">x</span>
              <input type="number" min="0" max="99" required placeholder="0" class="input-padrao input-gols" name="golsFora" />
            </div>
            <button type="submit" class="btn btn-primario btn-pequeno">🎯 Palpitar</button>
          </form>
        `
        : '';

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
            ${blocoPalpite}
            <button
              type="button"
              class="btn btn-grpc btn-apurar-partida"
              data-partida-id="${p.id}"
              data-descricao="${escaparHtml(nomeCasa)} x ${escaparHtml(nomeFora)}"
            >
              ⚡ Apurar Resultado na API Externa (Go + gRPC)
            </button>
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
      } catch (erro) {
        mostrarToast(erro.message, 'erro');
        botao.disabled = false;
        botao.textContent = textoOriginal;
      }
    });
  });
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

  // Inicializa cabeçalho e datas de Hoje e Amanhã
  atualizarCabecalhoUsuario();
  preencherDatasHojeEAmanha();

  // 1) Carrega as partidas reais de Hoje e Amanhã da TheSportsDB imediatamente
  const externas = await carregarPartidasExternasHojeEAmanha();

  // 2) Verifica se a API Quarkus está online e carrega o Mural do Banco
  const online = await verificarStatusApi();
  if (online) {
    const partidasNoBanco = await carregarPartidasArena();
    // Se o banco estiver vazio, sincroniza automaticamente as partidas de Hoje e Amanhã para o Mural!
    if (partidasNoBanco.length === 0 && externas.length > 0) {
      await importarTodasPartidasExternas(true);
    }
  } else {
    await carregarPartidasArena();
  }
});
