/**
 * PalpiteArena — Controlador Front-end com 2 Comportamentos (Cliente vs. Administrador)
 * e Função Desafio X1 (Apostas entre Perfis de Usuário com Retenção e Comissão de 5%).
 */

const CHAVE_SESSAO = 'palpitearena_sessao';
const URL_THESPORTSDB_DIA = 'https://www.thesportsdb.com/api/v1/json/123/eventsday.php';
const LIMITE_MURAL_PARTIDAS = 9;

// Detecta se está servido pela própria API (:8080 ou nuvem Render) ou aberto via Live Server / arquivo local
// Endereço da API: detectado automaticamente (mesma origem, localhost:8080 ou 127.0.0.1:8080)
let API_BASE_URL = window.location.protocol === 'file:' ? 'http://localhost:8080' : '';
let appInicializado = false;

async function sondarApi(base) {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), 3000);
  try {
    const resposta = await fetch(`${base}/q/health/live`, {
      signal: controlador.signal,
      headers: { Accept: 'application/json' },
    });
    if (!resposta.ok) return false;
    const corpo = await resposta.json();
    return Boolean(corpo && corpo.status === 'UP');
  } catch {
    return false;
  } finally {
    clearTimeout(temporizador);
  }
}

async function detectarBaseApi() {
  const ehHttp = window.location.protocol.startsWith('http');
  const candidatos = [API_BASE_URL];
  if (ehHttp) candidatos.push('');
  candidatos.push('http://localhost:8080', 'http://127.0.0.1:8080');
  for (const candidato of [...new Set(candidatos)]) {
    if (await sondarApi(candidato)) {
      API_BASE_URL = candidato;
      return true;
    }
  }
  return false;
}

const ESCUDO_PADRAO =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><path fill='%231e293b' stroke='%2310b981' stroke-width='3' d='M32 6L10 14v18c0 14 9.4 23.6 22 26 12.6-2.4 22-12 22-26V14L32 6z'/><text x='32' y='39' font-size='20' text-anchor='middle' fill='%23f8fafc' font-family='sans-serif' font-weight='bold'>⚽</text></svg>";

let partidasExternasCache = [];
let partidasArenaCache = [];
let desafiosCache = [];
let usuarioLogadoDados = null;
let apiOnline = false;
const convitesDesafioNotificadosIds = new Set();
const convitesBolaoNotificadosIds = new Set();

/* ==========================================================================
   1. SESSÃO JWT, MODO DE EXIBIÇÃO (CLIENTE vs. ADMIN) E CLIENTE HTTP
   ========================================================================== */

function obterSessao() {
  try {
    const bruto = localStorage.getItem(CHAVE_SESSAO);
    return bruto ? JSON.parse(bruto) : null;
  } catch {
    return null;
  }
}

function ehAdmin() {
  const sessao = obterSessao();
  if (!sessao || !sessao.token) return false;
  const email = (sessao.email || '').trim().toLowerCase();
  return sessao.papel === 'ADMIN' || email === 'admin@arenapro.com' || email.startsWith('admin@');
}

function salvarSessao(dadosLogin) {
  convitesDesafioNotificadosIds.clear();
  convitesBolaoNotificadosIds.clear();
  if (!dadosLogin) {
    localStorage.removeItem(CHAVE_SESSAO);
    usuarioLogadoDados = null;
  } else {
    localStorage.setItem(CHAVE_SESSAO, JSON.stringify(dadosLogin));
  }
  aplicarModoVisual();
  atualizarCabecalhoUsuario();
}

/**
 * Alterna o comportamento da página entre:
 * - "admin"     (admin@arenapro.com)
 * - "cliente"   (demais usuários logados, ex.: antonionnecp7@gmail.com)
 * - "visitante" (não logado)
 */
function aplicarModoVisual() {
  const sessao = obterSessao();
  const subtitulo = document.getElementById('subtitulo-modo');
  if (!sessao || !sessao.token) {
    document.body.dataset.modo = 'visitante';
    if (subtitulo) subtitulo.textContent = 'Visitante — Entre para desafiar outros usuários';
    return;
  }
  if (ehAdmin()) {
    document.body.dataset.modo = 'admin';
    if (subtitulo) subtitulo.textContent = 'Modo Administrador — Gestão de Partidas, Saldo e Carteira Casa';
  } else {
    document.body.dataset.modo = 'cliente';
    if (subtitulo) subtitulo.textContent = 'Modo Cliente — Desafios X1 entre Usuários';
  }
}

async function requisicaoApi(caminho, opcoes = {}) {
  const sessao = obterSessao();
  const cabecalhos = {
    Accept: 'application/json',
    ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}),
    ...(sessao && sessao.token ? { Authorization: `Bearer ${sessao.token}` } : {}),
    ...(opcoes.headers || {}),
  };

  let resposta;
  try {
    resposta = await fetch(`${API_BASE_URL}${caminho}`, {
      ...opcoes,
      headers: cabecalhos,
    });
  } catch {
    throw new Error(
      'Não foi possível conectar à API. Verifique se o sistema está ligado (docker compose up -d) e abra http://localhost:8080'
    );
  }

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

function erroComStatus(mensagem, statusHttp) {
  const erro = new Error(mensagem);
  erro.status = statusHttp;
  return erro;
}

function extrairErroProblemDetails(problema, statusHttp) {
  if (!problema || typeof problema !== 'object') {
    return erroComStatus(`Erro HTTP ${statusHttp} ao comunicar com a API.`, statusHttp);
  }
  if (Array.isArray(problema.errors) && problema.errors.length > 0) {
    const detalhesCampos = problema.errors
      .map((e) => `${e.campo}: ${e.mensagem}`)
      .join(' | ');
    return erroComStatus(`${problema.title || 'Dados inválidos'} — ${detalhesCampos}`, statusHttp);
  }
  const mensagem = problema.detail || problema.title || `Erro HTTP ${statusHttp}`;
  return erroComStatus(mensagem, statusHttp);
}

function mostrarToast(mensagem, tipo = 'sucesso', duracaoMs = 8000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${tipo}`;
  toast.textContent = mensagem;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-saindo');
    setTimeout(() => toast.remove(), 300);
  }, duracaoMs);
}

function formatarMoeda(valor) {
  const num = Number(valor || 0);
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function traduzirOpcaoDesafio(opcao, partida = null) {
  const nomeCasa = partida?.timeCasa?.nome || 'Time Mandante';
  const nomeFora = partida?.timeFora?.nome || 'Time Visitante';
  if (opcao === 'MANDANTE') return `🏠 Vitória ${nomeCasa}`;
  if (opcao === 'VISITANTE') return `✈️ Vitória ${nomeFora}`;
  if (opcao === 'EMPATE') return '🤝 Empate';
  return 'Aguardando escolha';
}

function selecionarAba(idAba) {
  // Impede cliente normal de abrir a aba admin
  if (idAba === 'admin' && !ehAdmin()) {
    idAba = 'partidas';
  }

  document.querySelectorAll('.aba-conteudo').forEach((secao) => {
    secao.classList.toggle('ativa', secao.id === `aba-${idAba}`);
  });
  document.querySelectorAll('.aba-btn').forEach((botao) => {
    botao.classList.toggle('ativa', botao.dataset.aba === idAba);
  });

  if (idAba === 'palpites') {
    desativarModoSelecaoBolao(false);
    carregarMinhasApostas();
  } else if (idAba === 'boloes') {
    desativarModoSelecaoBolao(false);
    carregarMeusBoloes();
  } else if (idAba === 'ranking') {
    desativarModoSelecaoBolao(false);
    carregarRanking();
  } else if (idAba === 'admin') {
    desativarModoSelecaoBolao(false);
    carregarPainelAdmin();
  } else if (idAba === 'partidas' && apiOnline) {
    carregarPartidasArena();
    carregarConvitesPendentes();
  }
}

/* ==========================================================================
   2. SAÚDE DA API, CARTEIRA NO TOPO E AUTENTICAÇÃO JWT
   ========================================================================== */

async function verificarStatusApi() {
  const indicador = document.getElementById('status-api');
  const estavaOnline = apiOnline;
  const online = await detectarBaseApi();
  apiOnline = online;

  if (indicador) {
    indicador.textContent = online ? '● API Online' : '● API Offline';
    indicador.className = online ? 'badge badge-online' : 'badge badge-offline';
  }

  // Quando a API volta a responder depois de ter ficado fora do ar, recarrega os dados automaticamente
  if (online && !estavaOnline && appInicializado) {
    await carregarDadosIniciais(true);
  }
  return online;
}

function chaveConfronto(casa, fora) {
  const norm = (t) => String(t || '').trim().toLowerCase();
  return `${norm(casa)}|${norm(fora)}`;
}

async function carregarDadosIniciais(online) {
  if (!online) {
    await carregarPartidasArena();
    return;
  }
  await sincronizarDadosUsuarioLogado();
  await importarTodasPartidasExternas(true);
  await carregarPartidasArena();
  await carregarConvitesPendentes();
}

async function sincronizarDadosUsuarioLogado() {
  const sessao = obterSessao();
  const containerCarteira = document.getElementById('info-carteira-topo');
  if (!sessao || !sessao.usuarioId) {
    if (containerCarteira) containerCarteira.innerHTML = '';
    return null;
  }

  try {
    const usuario = await requisicaoApi(`/usuarios/${sessao.usuarioId}`);
    usuarioLogadoDados = usuario;

    if (containerCarteira) {
      if (ehAdmin()) {
        const carteiraCasa = await requisicaoApi('/desafios/carteira-casa');
        containerCarteira.innerHTML = `
          <span class="badge badge-online" title="Comissões de 5% acumuladas pela plataforma">
            🏦 Carteira Casa: ${formatarMoeda(carteiraCasa?.saldoTotal || 0)}
          </span>
        `;
      } else {
        containerCarteira.innerHTML = `
          <span class="badge badge-online" title="Saldo disponível para desafiar ou aceitar apostas">
            💰 Saldo: ${formatarMoeda(usuario.saldo)}
          </span>
          <span class="badge badge-aviso" title="Saldo retido em apostas pendentes ou em andamento">
            🔒 Retido: ${formatarMoeda(usuario.saldoRetido)}
          </span>
        `;
      }
    }
    return usuario;
  } catch (erro) {
    // Só encerra a sessão se o usuário realmente não existir mais no banco (404).
    // Falhas de rede ou erros temporários da API NÃO derrubam o login.
    if (erro && erro.status === 404) {
      salvarSessao(null);
    }
    return null;
  }
}

function atualizarCabecalhoUsuario() {
  aplicarModoVisual();
  const container = document.getElementById('info-usuario-topo');
  if (!container) return;

  const sessao = obterSessao();
  if (!sessao || !sessao.token) {
    container.innerHTML = `<span class="badge badge-aviso">Visitante (Não autenticado)</span>`;
    const carteira = document.getElementById('info-carteira-topo');
    if (carteira) carteira.innerHTML = '';
    return;
  }

  const admin = ehAdmin();
  const rotuloPerfil = admin ? 'ADMIN' : 'CLIENTE';
  const classePapel = admin ? 'badge-info' : 'badge-online';

  container.innerHTML = `
    <span class="badge ${classePapel}">
      ${admin ? '🛡️' : '👤'} ${escaparHtml(sessao.nome)} (${rotuloPerfil})
    </span>
    <button id="btn-sair" class="btn btn-secundario btn-pequeno" type="button">Sair</button>
  `;

  document.getElementById('btn-sair')?.addEventListener('click', () => {
    salvarSessao(null);
    document.getElementById('secao-convites-pendentes')?.classList.add('oculto');
    mostrarToast('Sessão encerrada com sucesso.');
    selecionarAba('auth');
  });

  if (apiOnline) {
    sincronizarDadosUsuarioLogado();
  }
}

async function realizarLogin(evento) {
  evento.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const senha = document.getElementById('login-senha').value;

  if (!(await verificarStatusApi())) {
    mostrarToast('A API está desligada. Suba o sistema (docker compose up -d) e abra http://localhost:8080', 'erro');
    return;
  }

  try {
    const resposta = await requisicaoApi('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, senha }),
    });
    salvarSessao(resposta);
    await sincronizarDadosUsuarioLogado();
    await carregarPartidasArena();
    await carregarConvitesPendentes();

    if (ehAdmin()) {
      mostrarToast(`Bem-vindo, Administrador (${resposta.nome})! Painel Admin e Carteira Casa liberados.`);
      selecionarAba('admin');
    } else {
      mostrarToast(`Bem-vindo(a), ${resposta.nome}! Escolha uma das 9 partidas no Mural para desafiar outro usuário.`);
      selecionarAba('partidas');
    }
  } catch (erro) {
    mostrarToast(erro.message, 'erro');
  }
}

async function realizarCadastro(evento) {
  evento.preventDefault();
  const nome = document.getElementById('cad-nome').value.trim();
  const email = document.getElementById('cad-email').value.trim();
  const senha = document.getElementById('cad-senha').value;

  if (!(await verificarStatusApi())) {
    mostrarToast('A API está desligada. Suba o sistema (docker compose up -d) e abra http://localhost:8080', 'erro');
    return;
  }

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
    await sincronizarDadosUsuarioLogado();
    await carregarPartidasArena();
    await carregarConvitesPendentes();
    mostrarToast(`Conta criada com sucesso! Logado como ${loginAuto.nome}.`);
    document.getElementById('form-cadastro').reset();
    selecionarAba(ehAdmin() ? 'admin' : 'partidas');
  } catch (erro) {
    mostrarToast(erro.message, 'erro');
  }
}

/* ==========================================================================
   3. BUSCA DE 9 PARTIDAS NA API EXTERNA (TheSportsDB) E MURAL DE PARTIDAS
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

async function enriquecerPlacaresTempoRealLookup(eventos) {
  if (!Array.isArray(eventos) || eventos.length === 0) return eventos;
  const enriquecidos = await Promise.all(
    eventos.map(async (ev) => {
      if (!ev || !ev.idEvent || ev.strStatus === 'FT') return ev;
      try {
        const resp = await fetch(
          `https://www.thesportsdb.com/api/v1/json/123/lookupevent.php?id=${encodeURIComponent(ev.idEvent)}&_t=${Date.now()}`
        );
        if (!resp.ok) return ev;
        const dados = await resp.json();
        const atualizado = Array.isArray(dados?.events) ? dados.events[0] : null;
        return atualizado ? { ...ev, ...atualizado } : ev;
      } catch {
        return ev;
      }
    })
  );
  return enriquecidos;
}

async function carregarPartidasExternasHojeEAmanha() {
  const container = document.getElementById('lista-partidas-externas');
  const data1 = document.getElementById('filtro-data-hoje')?.value || obterDataLocalFormatada(0);
  const data2 = document.getElementById('filtro-data-amanha')?.value || obterDataLocalFormatada(1);

  if (container) {
    container.innerHTML = `<p class="texto-vazio">⏳ Consultando partidas de <strong>${data1}</strong> e <strong>${data2}</strong> na TheSportsDB...</p>`;
  }

  try {
    const data3 = obterDataLocalFormatada(2);
    const data4 = obterDataLocalFormatada(3);
    const [eventosDia1, eventosDia2, eventosDia3, eventosDia4] = await Promise.all([
      buscarEventosDiaTheSportsDB(data1),
      data2 && data2 !== data1 ? buscarEventosDiaTheSportsDB(data2) : Promise.resolve([]),
      buscarEventosDiaTheSportsDB(data3),
      buscarEventosDiaTheSportsDB(data4),
    ]);

    const mapaUnico = new Map();
    [...eventosDia1, ...eventosDia2, ...eventosDia3, ...eventosDia4].forEach((ev) => {
      if (ev && ev.idEvent && ev.strHomeTeam && ev.strAwayTeam) {
        mapaUnico.set(ev.idEvent, ev);
      }
    });

    const lista = Array.from(mapaUnico.values());
    lista.sort((a, b) => {
      const aBrasil = a.strCountry === 'Brazil' || (a.strLeague || '').includes('Brazil') ? 0 : 1;
      const bBrasil = b.strCountry === 'Brazil' || (b.strLeague || '').includes('Brazil') ? 0 : 1;
      if (aBrasil !== bBrasil) return aBrasil - bBrasil;
      return String(a.dateEvent || '').localeCompare(String(b.dateEvent || ''));
    });

    // Mantém as 9 partidas principais e consulta lookupevent.php sem cache para placar em tempo real
    const top9 = await enriquecerPlacaresTempoRealLookup(lista.slice(0, LIMITE_MURAL_PARTIDAS));
    partidasExternasCache = top9;
    renderizarPartidasExternas(partidasExternasCache, data1);
    return partidasExternasCache;
  } catch (erro) {
    if (container) {
      container.innerHTML = `<p class="texto-vazio">❌ Erro ao consultar a TheSportsDB: ${escaparHtml(erro.message)}</p>`;
    }
    return [];
  }
}

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
    container.innerHTML = `<p class="texto-vazio">Nenhuma partida encontrada na TheSportsDB para as datas selecionadas.</p>`;
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
      const escudoCasa = ev.strHomeTeamBadge || ESCUDO_PADRAO;
      const escudoFora = ev.strAwayTeamBadge || ESCUDO_PADRAO;

      return `
        <article class="card-partida">
          <div class="card-partida-topo">
            <span class="liga-tag">🏆 ${escaparHtml(ev.strLeague || 'Futebol')}</span>
            <span class="badge badge-info">📅 ${rotuloDia}</span>
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
            <button type="button" class="btn btn-secundario btn-bloco btn-importar-unica" data-indice="${indice}">
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
      try {
        await importarEventoExternoParaArena(ev);
        mostrarToast(`Partida "${ev.strHomeTeam} x ${ev.strAwayTeam}" sincronizada no Mural!`);
        await carregarPartidasArena();
        botao.textContent = '✅ Sincronizada';
      } catch (erro) {
        mostrarToast(erro.message, 'erro');
        botao.disabled = false;
      }
    });
  });
}

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

function eventoExternoTemPlacar(ev) {
  return (
    ev &&
    ev.intHomeScore !== null &&
    ev.intHomeScore !== undefined &&
    String(ev.intHomeScore).trim() !== '' &&
    ev.intAwayScore !== null &&
    ev.intAwayScore !== undefined &&
    String(ev.intAwayScore).trim() !== ''
  );
}

function eventoExternoJaFinalizado(ev) {
  const temPlacar = eventoExternoTemPlacar(ev);
  const emAndamento = ev.strStatus === '1H' || ev.strStatus === '2H' || ev.strStatus === 'HT' || ev.strStatus === 'LIVE';
  return ev.strStatus === 'FT' || ev.strStatus === 'AOT' || (temPlacar && !emAndamento);
}

function obterEstadoTempoRealPartida(p) {
  if (!p) return { placarExibicao: 'VS', aoVivo: false, finalizada: false };
  const finalizada = p.status === 'FINALIZADA';

  // Verifica se há placar ao vivo mais recente vindo da TheSportsDB em cache
  const chave = chaveConfronto(p.timeCasa?.nome, p.timeFora?.nome);
  const evExterno = partidasExternasCache.find(
    (ev) => chaveConfronto(ev.strHomeTeam, ev.strAwayTeam) === chave
  );

  let placarBruto = p.placar && String(p.placar).trim() !== '' ? String(p.placar).trim() : null;
  if (!finalizada && eventoExternoTemPlacar(evExterno)) {
    placarBruto = `${String(evExterno.intHomeScore).trim()}x${String(evExterno.intAwayScore).trim()}`;
  }

  const horarioJogoMs = p.data ? new Date(p.data).getTime() : NaN;
  const jaComecouPorHorario = !Number.isNaN(horarioJogoMs) && horarioJogoMs <= Date.now();
  const aoVivo = !finalizada && (Boolean(placarBruto) || jaComecouPorHorario);

  if (!placarBruto && aoVivo) {
    placarBruto = '0x0';
  }

  const placarExibicao = placarBruto ? placarBruto.replace('x', ' x ') : 'VS';
  return { placarExibicao, aoVivo, finalizada, placarBruto };
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
  const temPlacarParcialOuFinal = eventoExternoTemPlacar(ev);
  const horarioMs = new Date(isoLocal).getTime();
  const jaIniciouNoRelogio = !Number.isNaN(horarioMs) && horarioMs <= Date.now();

  const placarReal = temPlacarParcialOuFinal
    ? `${String(ev.intHomeScore).trim()}x${String(ev.intAwayScore).trim()}`
    : jaIniciouNoRelogio
    ? '0x0'
    : null;
  const statusReal = jaFinalizada ? 'FINALIZADA' : 'AGENDADA';

  const partidaExistente = (partidasAtuais || []).find(
    (p) => p.timeCasa?.id === timeCasa.id && p.timeFora?.id === timeFora.id
  );
  if (partidaExistente) {
    const mudouStatus = jaFinalizada && partidaExistente.status !== 'FINALIZADA';
    const mudouPlacar = placarReal && partidaExistente.placar !== placarReal && partidaExistente.status !== 'FINALIZADA';
    if (mudouStatus || mudouPlacar) {
      const atualizada = await requisicaoApi(`/partidas/${partidaExistente.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          timeCasaId: timeCasa.id,
          timeForaId: timeFora.id,
          data: isoLocal,
          placar: placarReal,
          status: statusReal,
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
  if (!partidasExternasCache || partidasExternasCache.length === 0) return;

  try {
    const times = await requisicaoApi('/times?pagina=0&tamanho=100');
    const partidas = await requisicaoApi('/partidas?pagina=0&tamanho=100');
    const mapaTimes = new Map();
    (times || []).forEach((t) => mapaTimes.set(t.nome.trim().toLowerCase(), t));

    let importadas = 0;
    for (const ev of partidasExternasCache.slice(0, LIMITE_MURAL_PARTIDAS)) {
      const criada = await importarEventoExternoParaArena(ev, { times, partidas, mapaTimes });
      if (criada) importadas++;
    }

    if (!silencioso && importadas > 0) {
      mostrarToast(`${importadas} partida(s) sincronizada(s) no Mural de Partidas!`);
    }
    await carregarPartidasArena();
  } catch (erro) {
    if (!silencioso) {
      mostrarToast(`Não foi possível sincronizar: ${erro.message}`, 'erro');
    }
  }
}

/* ==========================================================================
   4. MURAL DE 9 PARTIDAS & CARD DE DESAFIO X1
   ========================================================================== */

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

/**
 * Monta o Mural com 9 partidas: primeiro os jogos de Hoje/Amanhã vindos da TheSportsDB
 * (já sincronizados no banco), depois completa com as demais partidas mais próximas da data atual.
 */
function selecionarPartidasDoMural(partidasBanco) {
  const chavesExternas = new Set(
    partidasExternasCache.map((ev) => chaveConfronto(ev.strHomeTeam, ev.strAwayTeam))
  );
  const porData = (a, b) => String(a.data || '').localeCompare(String(b.data || ''));
  const destaque = partidasBanco
    .filter((p) => chavesExternas.has(chaveConfronto(p.timeCasa?.nome, p.timeFora?.nome)))
    .sort(porData);
  const agora = Date.now();
  const restantes = partidasBanco
    .filter((p) => !chavesExternas.has(chaveConfronto(p.timeCasa?.nome, p.timeFora?.nome)))
    .sort((a, b) => Math.abs(new Date(a.data) - agora) - Math.abs(new Date(b.data) - agora));
  return [...destaque, ...restantes].slice(0, LIMITE_MURAL_PARTIDAS);
}

async function carregarPartidasArena() {
  const container = document.getElementById('lista-partidas-arena');
  if (!container) return [];

  const filtroStatus = document.getElementById('filtro-status-arena')?.value || '';
  const queryStatus = filtroStatus ? `&status=${encodeURIComponent(filtroStatus)}` : '';

  try {
    const partidas = await requisicaoApi(`/partidas?pagina=0&tamanho=100${queryStatus}`);
    const lista9 = selecionarPartidasDoMural(partidas || []);
    partidasArenaCache = lista9;
    renderizarPartidasArena(lista9);
    return lista9;
  } catch {
    // Se a API Quarkus estiver offline, exibe os 9 cards direto da TheSportsDB como visualização
    if (partidasExternasCache.length > 0) {
      const simuladas = partidasExternasCache.slice(0, LIMITE_MURAL_PARTIDAS).map((ev, i) => {
        const { isoLocal } = converterUtcTheSportsDBParaBrasilia(ev);
        return {
          id: i + 1,
          timeCasa: { nome: ev.strHomeTeam, escudoUrl: ev.strHomeTeamBadge },
          timeFora: { nome: ev.strAwayTeam, escudoUrl: ev.strAwayTeamBadge },
          data: isoLocal,
          placar: ev.intHomeScore && ev.intAwayScore ? `${ev.intHomeScore}x${ev.intAwayScore}` : null,
          status: eventoExternoJaFinalizado(ev) ? 'FINALIZADA' : 'AGENDADA',
          somenteLeituraExterna: true,
        };
      });
      partidasArenaCache = simuladas;
      renderizarPartidasArena(simuladas);
    } else {
      container.innerHTML = `<p class="texto-vazio">Conecte a API Quarkus na porta 8080 para carregar as 9 partidas do Mural.</p>`;
    }
    return [];
  }
}

function renderizarPartidasArena(partidas) {
  const container = document.getElementById('lista-partidas-arena');
  if (!container) return;

  if (!partidas || partidas.length === 0) {
    container.innerHTML = `<p class="texto-vazio">Nenhuma partida disponível no Mural com este filtro.</p>`;
    return;
  }

  const admin = ehAdmin();

  container.innerHTML = partidas
    .map((p) => {
      const nomeCasa = p.timeCasa?.nome || 'Time Casa';
      const nomeFora = p.timeFora?.nome || 'Time Fora';
      const escudoCasa = p.timeCasa?.escudoUrl || ESCUDO_PADRAO;
      const escudoFora = p.timeFora?.escudoUrl || ESCUDO_PADRAO;
      const { placarExibicao, aoVivo, finalizada } = obterEstadoTempoRealPartida(p);
      const { data: dataBr, hora: horaBr } = extrairDataEHoraArena(p.data);

      const badgeStatus = finalizada
        ? `<span class="badge badge-online">✅ FINALIZADA</span>`
        : aoVivo
        ? `<span class="badge badge-info">🔴 AO VIVO (${escaparHtml(placarExibicao)})</span>`
        : `<span class="badge badge-aviso">⏳ ABERTA PARA DESAFIO</span>`;

      const botaoAcao = p.somenteLeituraExterna && !finalizada
        ? `<div class="aviso-partida-encerrada">⚠️ API offline — ligue o sistema (docker compose up -d) para desafiar nesta partida</div>`
        : !finalizada
        ? `
          <button
            type="button"
            class="btn btn-primario btn-bloco btn-abrir-desafio"
            data-partida-id="${p.id}"
          >
            ⚔️ Desafiar Usuário nesta Partida
          </button>
          ${
            admin
              ? `<button
                  type="button"
                  class="btn btn-grpc btn-apurar-partida"
                  data-partida-id="${p.id}"
                  data-descricao="${escaparHtml(nomeCasa)} x ${escaparHtml(nomeFora)}"
                >
                  ⚡ Apurar Resultado na API Externa (Go + gRPC)
                </button>`
              : ''
          }
        `
        : `
          <div class="aviso-partida-encerrada">
            🔒 Partida encerrada — Placar Oficial: <strong>${escaparHtml(placarExibicao)}</strong>
          </div>
        `;

      const selecionadaNoBolao = modoSelecaoBolaoAtivo && partidasSelecionadasBolaoIds.has(Number(p.id));
      const caixinhaBolaoHtml =
        modoSelecaoBolaoAtivo && !finalizada
          ? `<span class="caixinha-selecao-bolao ${selecionadaNoBolao ? 'marcada' : ''}" data-check-partida-id="${p.id}" title="Marcar/desmarcar partida para o Bolão">${selecionadaNoBolao ? '✅' : ''}</span>`
          : '';

      return `
        <article class="card-partida ${!finalizada ? 'card-partida-clicavel' : ''} ${selecionadaNoBolao ? 'partida-selecionada-bolao' : ''}" data-card-partida-id="${p.id}">
          <div class="card-partida-topo">
            <div style="display:flex;align-items:center;gap:8px;">
              ${caixinhaBolaoHtml}
              <span class="liga-tag">Jogo #${p.id} • 📅 ${escaparHtml(dataBr)}</span>
            </div>
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
            ${botaoAcao}
          </div>
        </article>
      `;
    })
    .join('');

  // Ao clicar no botão ou no card da partida, abre o Card de Desafio X1 (ou marca ✅ se estiver no Modo Bolão)
  container.querySelectorAll('.btn-abrir-desafio').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (modoSelecaoBolaoAtivo) {
        alternarSelecaoPartidaBolao(Number(btn.dataset.partidaId));
        return;
      }
      abrirModalDesafio(Number(btn.dataset.partidaId));
    });
  });

  container.querySelectorAll('.card-partida-clicavel').forEach((card) => {
    card.addEventListener('click', (ev) => {
      if (modoSelecaoBolaoAtivo) {
        alternarSelecaoPartidaBolao(Number(card.dataset.cardPartidaId));
        return;
      }
      if (ev.target.closest('button')) return;
      abrirModalDesafio(Number(card.dataset.cardPartidaId));
    });
  });

  // Botão exclusivo do Admin para apurar via Go + gRPC
  container.querySelectorAll('.btn-apurar-partida').forEach((botao) => {
    botao.addEventListener('click', async (ev) => {
      ev.stopPropagation();
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
          `Resultado apurado para ${descricao}: ${partidaApurada.placar}! Desafios X1 liquidados com comissão de 5%.`
        );
        await sincronizarDadosUsuarioLogado();
        await carregarPartidasArena();
      } catch (erro) {
        mostrarToast(erro.message, 'erro');
        botao.disabled = false;
        botao.textContent = textoOriginal;
      }
    });
  });
}

async function abrirModalDesafio(partidaId) {
  const sessao = obterSessao();
  if (!sessao || !sessao.usuarioId) {
    mostrarToast('Faça login primeiro para desafiar outro usuário!', 'erro');
    selecionarAba('auth');
    return;
  }

  const partida = partidasArenaCache.find((p) => Number(p.id) === Number(partidaId));
  if (!partida) return;

  if (partida.somenteLeituraExterna) {
    mostrarToast('A API está offline. Suba o sistema para criar desafios nesta partida.', 'erro');
    return;
  }

  if (partida.status === 'FINALIZADA') {
    mostrarToast('Esta partida já foi encerrada.', 'erro');
    return;
  }

  await sincronizarDadosUsuarioLogado();

  const nomeCasa = partida.timeCasa?.nome || 'Time Mandante';
  const nomeFora = partida.timeFora?.nome || 'Time Visitante';
  const escudoCasa = partida.timeCasa?.escudoUrl || ESCUDO_PADRAO;
  const escudoFora = partida.timeFora?.escudoUrl || ESCUDO_PADRAO;
  const { data: dataBr, hora: horaBr } = extrairDataEHoraArena(partida.data);

  document.getElementById('desafio-partida-id').value = String(partida.id);
  document.getElementById('modal-desafio-titulo').textContent = `Desafiar Usuário — ${nomeCasa} x ${nomeFora}`;
  document.getElementById('label-opcao-mandante').textContent = `🏠 Vitória ${nomeCasa}`;
  document.getElementById('label-opcao-visitante').textContent = `✈️ Vitória ${nomeFora}`;

  const saldoAtual = usuarioLogadoDados?.saldo ?? 0;
  document.getElementById('desafio-info-saldo').innerHTML =
    `Seu saldo disponível: <strong class="destaque-verde">${formatarMoeda(saldoAtual)}</strong>. O valor apostado ficará retido até o término da partida.`;

  document.getElementById('modal-desafio-confronto').innerHTML = `
    <div class="time-bloco">
      <img src="${escaparHtml(escudoCasa)}" alt="${escaparHtml(nomeCasa)}" class="escudo-time" onerror="this.src='${ESCUDO_PADRAO}'" />
      <span class="nome-time">${escaparHtml(nomeCasa)}</span>
    </div>
    <div class="placar-central">
      <span class="placar-numero">VS</span>
      <span class="versus-label">📅 ${escaparHtml(dataBr)}</span>
      <span class="horario-partida">🕒 ${escaparHtml(horaBr)}</span>
    </div>
    <div class="time-bloco">
      <img src="${escaparHtml(escudoFora)}" alt="${escaparHtml(nomeFora)}" class="escudo-time" onerror="this.src='${ESCUDO_PADRAO}'" />
      <span class="nome-time">${escaparHtml(nomeFora)}</span>
    </div>
  `;

  // Carrega lista de e-mails de outros usuários cadastrados para facilitar o preenchimento
  try {
    const usuarios = await requisicaoApi('/usuarios?pagina=0&tamanho=100');
    const datalist = document.getElementById('lista-emails-sugeridos');
    if (datalist && Array.isArray(usuarios)) {
      datalist.innerHTML = usuarios
        .filter((u) => Number(u.id) !== Number(sessao.usuarioId))
        .map((u) => `<option value="${escaparHtml(u.email)}">${escaparHtml(u.nome)} (Saldo: ${formatarMoeda(u.saldo)})</option>`)
        .join('');
    }
  } catch {
    // ignora caso offline
  }

  document.getElementById('modal-desafio-overlay')?.classList.remove('oculto');
}

function fecharModalDesafio() {
  document.getElementById('modal-desafio-overlay')?.classList.add('oculto');
}

async function enviarNovoDesafio(evento) {
  evento.preventDefault();
  const sessao = obterSessao();
  if (!sessao || !sessao.usuarioId) {
    mostrarToast('Faça login para criar um desafio.', 'erro');
    return;
  }

  const partidaId = Number(document.getElementById('desafio-partida-id').value);
  const emailDesafiado = document.getElementById('desafio-email-adversario').value.trim();
  const valor = Number(document.getElementById('desafio-valor').value);
  const radioSelecionado = document.querySelector('input[name="opcaoDesafiante"]:checked');

  if (!radioSelecionado) {
    mostrarToast('Selecione em qual resultado você está apostando!', 'erro');
    return;
  }

  try {
    const criado = await requisicaoApi('/desafios', {
      method: 'POST',
      body: JSON.stringify({
        desafianteId: sessao.usuarioId,
        partidaId,
        emailDesafiado,
        opcaoDesafiante: radioSelecionado.value,
        valor,
      }),
    });

    fecharModalDesafio();
    document.getElementById('form-criar-desafio').reset();
    await sincronizarDadosUsuarioLogado();
    mostrarToast(
      `📨 Convite de Desafio X1 #${criado.id} enviado com sucesso para ${emailDesafiado}! Valor de ${formatarMoeda(valor)} retido.`,
      'sucesso',
      8000
    );
    selecionarAba('palpites');
  } catch (erro) {
    mostrarToast(erro.message, 'erro');
  }
}

/* ==========================================================================
   5. CONVITES RECEBIDOS (USUÁRIO B) E ABA "MINHAS APOSTAS"
   ========================================================================== */

async function carregarConvitesPendentes() {
  const secao = document.getElementById('secao-convites-pendentes');
  const container = document.getElementById('lista-convites-pendentes');
  const sessao = obterSessao();

  if (!secao || !container || !sessao || !sessao.usuarioId || !apiOnline) {
    secao?.classList.add('oculto');
    return;
  }

  try {
    const desafios = await requisicaoApi(`/desafios?usuarioId=${sessao.usuarioId}&pagina=0&tamanho=50`);
    const pendentesParaMim = (desafios || []).filter(
      (d) => d.status === 'PENDENTE' && Number(d.desafiado?.id) === Number(sessao.usuarioId)
    );

    pendentesParaMim.forEach((d) => {
      if (!convitesDesafioNotificadosIds.has(Number(d.id))) {
        convitesDesafioNotificadosIds.add(Number(d.id));
        const jogo = `${d.partida?.timeCasa?.nome || 'Mandante'} x ${d.partida?.timeFora?.nome || 'Visitante'}`;
        mostrarToast(
          `🔔 Você recebeu um convite de Desafio X1 (#${d.id}) de ${d.desafiante?.nome || 'um usuário'} na partida ${jogo} (${formatarMoeda(d.valor)})!`,
          'sucesso',
          8000
        );
      }
    });

    if (pendentesParaMim.length === 0) {
      secao.classList.add('oculto');
    } else {
      secao.classList.remove('oculto');
      container.innerHTML = pendentesParaMim.map((d) => montarCardConviteParaAceite(d)).join('');
      registrarEventosAceiteRecusa(container);
    }
  } catch {
    secao.classList.add('oculto');
  }

  // Verifica também se o usuário convidado recebeu convite(s) de Bolão
  try {
    const boloes = await requisicaoApi(`/boloes?usuarioId=${encodeURIComponent(sessao.usuarioId)}`);
    (boloes || []).forEach((b) => {
      if (b.status !== 'ABERTO') return;
      const minhaPart = (b.participantes || []).find(
        (p) => Number(p.usuario?.id) === Number(sessao.usuarioId) && p.status === 'PENDENTE'
      );
      if (minhaPart && !convitesBolaoNotificadosIds.has(Number(b.id))) {
        convitesBolaoNotificadosIds.add(Number(b.id));
        mostrarToast(
          `🔔 Você recebeu um convite para o Bolão #${b.id} enviado por ${b.criador?.nome || 'um usuário'} (Valor: ${formatarMoeda(b.valorCota)})! Acesse a aba "🎲 Meus Bolões".`,
          'sucesso',
          8000
        );
      }
    });
  } catch {
    // Silencioso caso falhe na sondagem
  }
}

function montarCardConviteParaAceite(d) {
  const partida = d.partida || {};
  const nomeCasa = partida.timeCasa?.nome || 'Time Mandante';
  const nomeFora = partida.timeFora?.nome || 'Time Visitante';
  const opcaoBloqueada = d.opcaoDesafiante;

  const opcoes = [
    { codigo: 'MANDANTE', rotulo: `🏠 Vitória ${nomeCasa}` },
    { codigo: 'EMPATE', rotulo: '🤝 Empate' },
    { codigo: 'VISITANTE', rotulo: `✈️ Vitória ${nomeFora}` },
  ];

  const htmlOpcoes = opcoes
    .map((op) => {
      const bloqueada = op.codigo === opcaoBloqueada;
      return `
        <label class="opcao-desafio-card ${bloqueada ? 'opcao-bloqueada' : ''}">
          <input
            type="radio"
            name="opcaoAceite_${d.id}"
            value="${op.codigo}"
            ${bloqueada ? 'disabled' : 'required'}
          />
          <span class="opcao-titulo">${escaparHtml(op.rotulo)}</span>
          <small>${bloqueada ? `🔒 Escolhida por ${escaparHtml(d.desafiante?.nome)}` : 'Disponível para você'}</small>
        </label>
      `;
    })
    .join('');

  return `
    <article class="card-partida" style="border-color: var(--amarelo-aviso);">
      <div class="card-partida-topo">
        <span class="liga-tag">Convite #${d.id} • ${escaparHtml(nomeCasa)} x ${escaparHtml(nomeFora)}</span>
        <span class="badge badge-aviso">💰 Aposta: ${formatarMoeda(d.valor)}</span>
      </div>

      <p style="font-size: 0.88rem; color: var(--texto);">
        O usuário <strong>${escaparHtml(d.desafiante?.nome)}</strong> (<code>${escaparHtml(d.desafiante?.email)}</code>)
        desafiou você apostando em <strong>${escaparHtml(traduzirOpcaoDesafio(d.opcaoDesafiante, partida))}</strong>!
      </p>

      <form class="form-aceitar-desafio" data-desafio-id="${d.id}">
        <div class="grade-opcoes-desafio" style="margin: 8px 0;">
          ${htmlOpcoes}
        </div>
        <div style="display: flex; gap: 8px; margin-top: 8px;">
          <button type="submit" class="btn btn-primario" style="flex: 1;">
            ✅ Aceitar Desafio (Reter ${formatarMoeda(d.valor)})
          </button>
          <button type="button" class="btn btn-perigo btn-recusar-desafio" data-desafio-id="${d.id}">
            ❌ Recusar
          </button>
        </div>
      </form>
    </article>
  `;
}

function registrarEventosAceiteRecusa(container) {
  const sessao = obterSessao();
  if (!sessao) return;

  container.querySelectorAll('.form-aceitar-desafio').forEach((form) => {
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const desafioId = Number(form.dataset.desafioId);
      const radio = form.querySelector(`input[name="opcaoAceite_${desafioId}"]:checked`);
      if (!radio) {
        mostrarToast('Escolha uma das opções disponíveis para aceitar a aposta!', 'erro');
        return;
      }

      try {
        await requisicaoApi(`/desafios/${desafioId}/aceitar`, {
          method: 'POST',
          body: JSON.stringify({
            usuarioId: sessao.usuarioId,
            opcaoDesafiado: radio.value,
          }),
        });
        mostrarToast(`Desafio #${desafioId} aceito! Os valores dos dois jogadores estão retidos até o fim da partida.`);
        await sincronizarDadosUsuarioLogado();
        await carregarConvitesPendentes();
        await carregarMinhasApostas();
      } catch (erro) {
        mostrarToast(erro.message, 'erro');
      }
    });
  });

  container.querySelectorAll('.btn-recusar-desafio').forEach((btn) => {
    btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const desafioId = Number(btn.dataset.desafioId);
      try {
        await requisicaoApi(`/desafios/${desafioId}/recusar`, {
          method: 'POST',
          body: JSON.stringify({ usuarioId: sessao.usuarioId }),
        });
        mostrarToast(`Convite #${desafioId} recusado. O saldo retido foi devolvido ao desafiante.`);
        await sincronizarDadosUsuarioLogado();
        await carregarConvitesPendentes();
        await carregarMinhasApostas();
      } catch (erro) {
        mostrarToast(erro.message, 'erro');
      }
    });
  });
}

async function carregarMinhasApostas() {
  const container = document.getElementById('lista-meus-palpites');
  if (!container) return [];

  const sessao = obterSessao();
  if (!sessao || !sessao.usuarioId) {
    container.innerHTML = `
      <div class="texto-vazio">
        <p style="margin-bottom: 12px;">🔐 Entre na sua conta para visualizar e gerenciar <strong>Minhas Apostas (Desafios X1)</strong>.</p>
        <button type="button" id="btn-ir-login-palpites" class="btn btn-primario">
          Entrar / Criar Conta Agora
        </button>
      </div>
    `;
    document.getElementById('btn-ir-login-palpites')?.addEventListener('click', () => selecionarAba('auth'));
    return [];
  }

  await sincronizarDadosUsuarioLogado();

  try {
    const query = ehAdmin() ? '' : `&usuarioId=${encodeURIComponent(sessao.usuarioId)}`;
    const desafios = await requisicaoApi(`/desafios?pagina=0&tamanho=100${query}`);
    const lista = Array.isArray(desafios) ? desafios : [];
    desafiosCache = lista;

    atualizarResumoFinanceiroEApostas(lista);

    const filtroStatus = document.getElementById('filtro-escopo-palpites')?.value || 'todos_meus';
    const filtrados =
      filtroStatus === 'todos_meus' ? lista : lista.filter((d) => d.status === filtroStatus);

    renderizarMinhasApostas(filtrados);
    return filtrados;
  } catch (erro) {
    container.innerHTML = `<p class="texto-vazio">⚠️ Não foi possível carregar suas apostas (${escaparHtml(erro.message)}).</p>`;
    return [];
  }
}

function atualizarResumoFinanceiroEApostas(desafios) {
  const sessao = obterSessao();
  const saldoDisp = usuarioLogadoDados?.saldo ?? 0;
  const saldoRet = usuarioLogadoDados?.saldoRetido ?? 0;

  let ativos = 0;
  let vencidos = 0;
  (desafios || []).forEach((d) => {
    if (d.status === 'PENDENTE' || d.status === 'ACEITO') ativos++;
    if (d.status === 'FINALIZADO' && sessao && Number(d.vencedor?.id) === Number(sessao.usuarioId)) {
      vencidos++;
    }
  });

  const elDisp = document.getElementById('stat-saldo-disponivel');
  const elRet = document.getElementById('stat-saldo-retido');
  const elAtivos = document.getElementById('stat-desafios-ativos');
  const elVencidos = document.getElementById('stat-desafios-vencidos');

  if (elDisp) elDisp.textContent = formatarMoeda(saldoDisp);
  if (elRet) elRet.textContent = formatarMoeda(saldoRet);
  if (elAtivos) elAtivos.textContent = String(ativos);
  if (elVencidos) elVencidos.textContent = String(vencidos);
}

function renderizarMinhasApostas(desafios) {
  const container = document.getElementById('lista-meus-palpites');
  if (!container) return;

  if (!desafios || desafios.length === 0) {
    container.innerHTML = `
      <p class="texto-vazio">
        🎯 Nenhuma aposta encontrada com este filtro. Vá em <strong>"🏟️ Mural de Partidas"</strong> e clique em uma partida para desafiar outro usuário!
      </p>
    `;
    return;
  }

  const sessao = obterSessao();

  container.innerHTML = desafios
    .map((d) => {
      const partida = d.partida || {};
      const nomeCasa = partida.timeCasa?.nome || 'Time Mandante';
      const nomeFora = partida.timeFora?.nome || 'Time Visitante';
      const escudoCasa = partida.timeCasa?.escudoUrl || ESCUDO_PADRAO;
      const escudoFora = partida.timeFora?.escudoUrl || ESCUDO_PADRAO;
      const { data: dataBr, hora: horaBr } = extrairDataEHoraArena(partida.data);

      const souDesafiante = sessao && Number(d.desafiante?.id) === Number(sessao.usuarioId);
      const souDesafiado = sessao && Number(d.desafiado?.id) === Number(sessao.usuarioId);
      const adversario = souDesafiante ? d.desafiado : d.desafiante;
      const minhaOpcao = souDesafiante ? d.opcaoDesafiante : d.opcaoDesafiado;
      const opcaoAdversario = souDesafiante ? d.opcaoDesafiado : d.opcaoDesafiante;

      let badgeStatus = `<span class="badge badge-aviso">⏳ PENDENTE</span>`;
      if (d.status === 'ACEITO') {
        badgeStatus = `<span class="badge badge-info">🔒 ACEITO (VALORES RETIDOS)</span>`;
      } else if (d.status === 'FINALIZADO') {
        if (!d.vencedor) {
          badgeStatus = `<span class="badge badge-aviso">⚖️ SEM VENCEDOR (-2,5% CADA)</span>`;
        } else if (sessao && Number(d.vencedor.id) === Number(sessao.usuarioId)) {
          badgeStatus = `<span class="badge badge-online">🏆 VOCÊ VENCEU (+${formatarMoeda(d.premioVencedor)})</span>`;
        } else {
          badgeStatus = `<span class="badge badge-offline">❌ DERROTA (${escaparHtml(d.vencedor.nome)} venceu)</span>`;
        }
      } else if (d.status === 'CANCELADO') {
        badgeStatus = `<span class="badge badge-offline">🚫 CANCELADO</span>`;
      } else if (d.status === 'RECUSADO') {
        badgeStatus = `<span class="badge badge-offline">❌ RECUSADO</span>`;
      } else if (d.status === 'EXPIRADO') {
        badgeStatus = `<span class="badge badge-offline">⌛ EXPIRADO (GOL/FIM)</span>`;
      }

      // Botões de ação conforme o estado e o papel na aposta
      let rodapeAcao = `
        <button type="button" class="btn btn-secundario btn-pequeno btn-abrir-detalhe-aposta" data-desafio-id="${d.id}">
          🔍 Abrir Detalhes da Aposta
        </button>
      `;

      if (d.status === 'PENDENTE' && souDesafiante) {
        rodapeAcao = `
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button type="button" class="btn btn-secundario btn-pequeno btn-abrir-detalhe-aposta" data-desafio-id="${d.id}" style="flex: 1;">
              🔍 Ver Card Completo
            </button>
            <button type="button" class="btn btn-perigo btn-pequeno btn-cancelar-desafio" data-desafio-id="${d.id}">
              🚫 Cancelar Convite
            </button>
          </div>
        `;
      } else if (d.status === 'PENDENTE' && souDesafiado) {
        rodapeAcao = `
          <button type="button" class="btn btn-primario btn-pequeno btn-abrir-detalhe-aposta" data-desafio-id="${d.id}">
            🔔 Responder Convite (Aceitar / Recusar)
          </button>
        `;
      }

      return `
        <article class="card-partida card-partida-clicavel" data-card-desafio-id="${d.id}">
          <div class="card-partida-topo">
            <span class="liga-tag">Aposta #${d.id} • 📅 ${escaparHtml(dataBr)} (${escaparHtml(horaBr)})</span>
            ${badgeStatus}
          </div>

          <div class="confronto">
            <div class="time-bloco">
              <img src="${escaparHtml(escudoCasa)}" alt="${escaparHtml(nomeCasa)}" class="escudo-time" onerror="this.src='${ESCUDO_PADRAO}'" />
              <span class="nome-time">${escaparHtml(nomeCasa)}</span>
            </div>
            <div class="placar-central">
              <span class="placar-numero">${formatarMoeda(d.valor)}</span>
              <span class="versus-label">${partida.placar ? `Placar: ${escaparHtml(partida.placar)}` : 'Valor da Aposta'}</span>
            </div>
            <div class="time-bloco">
              <img src="${escaparHtml(escudoFora)}" alt="${escaparHtml(nomeFora)}" class="escudo-time" onerror="this.src='${ESCUDO_PADRAO}'" />
              <span class="nome-time">${escaparHtml(nomeFora)}</span>
            </div>
          </div>

          <div class="comparativo-placares">
            <div class="caixa-placar-info">
              <span>👤 Sua Escolha</span>
              <strong class="destaque-verde" style="font-size: 0.92rem;">${escaparHtml(traduzirOpcaoDesafio(minhaOpcao, partida))}</strong>
            </div>
            <div class="caixa-placar-info">
              <span>⚔️ Adversário: ${escaparHtml(adversario?.nome || 'Usuário')}</span>
              <strong class="destaque-azul" style="font-size: 0.92rem;">${escaparHtml(traduzirOpcaoDesafio(opcaoAdversario, partida))}</strong>
            </div>
          </div>

          <div class="card-partida-rodape">
            ${rodapeAcao}
          </div>
        </article>
      `;
    })
    .join('');

  // Ao clicar no card ou no botão de detalhes, abre o Modal com todos os dados da aposta
  container.querySelectorAll('[data-card-desafio-id]').forEach((card) => {
    card.addEventListener('click', (ev) => {
      if (ev.target.closest('.btn-cancelar-desafio')) return;
      abrirModalDetalheAposta(Number(card.dataset.cardDesafioId));
    });
  });

  // Cancelamento do convite pelo Usuário A (somente antes de B aceitar)
  container.querySelectorAll('.btn-cancelar-desafio').forEach((btn) => {
    btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const desafioId = Number(btn.dataset.desafioId);
      btn.disabled = true;
      try {
        await requisicaoApi(`/desafios/${desafioId}/cancelar`, {
          method: 'POST',
          body: JSON.stringify({ usuarioId: sessao.usuarioId }),
        });
        mostrarToast(`Convite #${desafioId} cancelado! O valor retido voltou para o seu saldo disponível.`);
        await carregarMinhasApostas();
      } catch (erro) {
        mostrarToast(erro.message, 'erro');
        btn.disabled = false;
      }
    });
  });
}

function abrirModalDetalheAposta(desafioId) {
  const d = desafiosCache.find((item) => Number(item.id) === Number(desafioId));
  if (!d) return;

  const sessao = obterSessao();
  const partida = d.partida || {};
  const nomeCasa = partida.timeCasa?.nome || 'Time Mandante';
  const nomeFora = partida.timeFora?.nome || 'Time Visitante';
  const souDesafiante = sessao && Number(d.desafiante?.id) === Number(sessao.usuarioId);
  const souDesafiado = sessao && Number(d.desafiado?.id) === Number(sessao.usuarioId);

  document.getElementById('detalhe-aposta-badge').textContent = `APOSTA X1 #${d.id} • ${d.status}`;
  document.getElementById('detalhe-aposta-titulo').textContent = `${nomeCasa} x ${nomeFora}`;

  const comissaoEstimada = Number(d.valor || 0) * 0.05;
  const premioEstimado = Number(d.valor || 0) * 2 - comissaoEstimada;

  let blocoAcoes = '';
  if (d.status === 'PENDENTE' && souDesafiante) {
    blocoAcoes = `
      <button type="button" id="btn-modal-cancelar-convite" class="btn btn-perigo btn-bloco" data-desafio-id="${d.id}">
        🚫 Cancelar Meu Convite e Receber ${formatarMoeda(d.valor)} de Volta
      </button>
    `;
  } else if (d.status === 'PENDENTE' && souDesafiado) {
    blocoAcoes = montarCardConviteParaAceite(d);
  }

  const corpo = document.getElementById('detalhe-aposta-corpo');
  corpo.innerHTML = `
    <div class="bloco-detalhe-x1">
      <div class="linha-detalhe-x1">
        <span>👤 Desafiante</span>
        <strong>${escaparHtml(d.desafiante?.nome)}</strong>
      </div>
      <div class="linha-detalhe-x1">
        <span>🎯 Palpite</span>
        <strong class="destaque-verde">${escaparHtml(traduzirOpcaoDesafio(d.opcaoDesafiante, partida))}</strong>
      </div>
      <div class="linha-detalhe-x1">
        <span>⚔️ Desafiado</span>
        <strong>${escaparHtml(d.desafiado?.nome)}</strong>
      </div>
      <div class="linha-detalhe-x1">
        <span>🎯 Palpite</span>
        <strong class="destaque-azul">${escaparHtml(traduzirOpcaoDesafio(d.opcaoDesafiado, partida))}</strong>
      </div>
    </div>

    <div class="bloco-detalhe-x1">
      <div class="linha-detalhe-x1">
        <span>💰 Valor Apostado por Jogador</span>
        <strong>${formatarMoeda(d.valor)}</strong>
      </div>
      <div class="linha-detalhe-x1">
        <span>🏦 Comissão da Plataforma (5%)</span>
        <strong class="destaque-amarelo">${formatarMoeda(d.status === 'FINALIZADO' ? d.comissaoCasa : comissaoEstimada)}</strong>
      </div>
      <div class="linha-detalhe-x1">
        <span>🏆 Retorno Total ao Vencedor (Seu valor + 95% do adversário)</span>
        <strong class="destaque-verde">${formatarMoeda(d.status === 'FINALIZADO' ? d.premioVencedor : premioEstimado)}</strong>
      </div>
      <div class="linha-detalhe-x1">
        <span>🏟️ Status da Partida</span>
        <strong>${escaparHtml(partida.status || 'AGENDADA')} ${partida.placar ? `(${escaparHtml(partida.placar)})` : ''}</strong>
      </div>
    </div>

    ${blocoAcoes}
  `;

  if (d.status === 'PENDENTE' && souDesafiado) {
    registrarEventosAceiteRecusa(corpo);
  }

  document.getElementById('btn-modal-cancelar-convite')?.addEventListener('click', async () => {
    try {
      await requisicaoApi(`/desafios/${d.id}/cancelar`, {
        method: 'POST',
        body: JSON.stringify({ usuarioId: sessao.usuarioId }),
      });
      document.getElementById('modal-detalhe-aposta-overlay')?.classList.add('oculto');
      mostrarToast(`Convite #${d.id} cancelado e saldo devolvido!`);
      await carregarMinhasApostas();
    } catch (erro) {
      mostrarToast(erro.message, 'erro');
    }
  });

  document.getElementById('modal-detalhe-aposta-overlay')?.classList.remove('oculto');
}

/* ==========================================================================
   6. RANKING DE USUÁRIOS (ABA 4) E PAINEL ADMINISTRATIVO (ABA 5)
   ========================================================================== */

async function carregarRanking() {
  const tbody = document.getElementById('corpo-tabela-ranking');
  if (!tbody) return [];

  try {
    const usuarios = await requisicaoApi('/usuarios/ranking?pagina=0&tamanho=100');
    const lista = Array.isArray(usuarios) ? usuarios : [];

    if (lista.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="texto-vazio">Nenhum usuário cadastrado.</td></tr>`;
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

        return `
          <tr class="${classeLinha}">
            <td><strong>${posicao}</strong></td>
            <td><strong>${escaparHtml(u.nome)}</strong>${tagVoce}</td>
            <td><code>${escaparHtml(u.email)}</code></td>
            <td class="col-direita">
              <span class="pontos-pill">${Number(u.pontuacaoTotal || 0)} pts</span>
            </td>
            <td class="col-direita">
              <span class="pontos-pill">${formatarMoeda(u.saldo)}</span>
            </td>
          </tr>
        `;
      })
      .join('');

    return lista;
  } catch (erro) {
    tbody.innerHTML = `<tr><td colspan="4" class="texto-vazio">⚠️ Erro ao carregar usuários (${escaparHtml(erro.message)}).</td></tr>`;
    return [];
  }
}

async function carregarPainelAdmin() {
  const banner = document.getElementById('aviso-permissao-admin');
  const sessao = obterSessao();
  if (banner) {
    banner.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
        <div>
          <h2>🛡️ Painel do Administrador (${escaparHtml(sessao?.nome || 'Admin')})</h2>
          <p>Gerencie a <strong>Carteira Casa</strong> (comissões de 5%), credite saldo fictício nos clientes e finalize partidas para liquidar apostas X1.</p>
        </div>
        <span class="badge badge-info">ADMIN: ${escaparHtml(sessao?.email || 'admin@arenapro.com')}</span>
      </div>
    `;
  }

  const selectCasa = document.getElementById('partida-casa');
  const selectFora = document.getElementById('partida-fora');
  const selectUsuarioCredito = document.getElementById('credito-usuario-select');
  const tbodyUsuarios = document.getElementById('corpo-tabela-usuarios-admin');
  const containerTimes = document.getElementById('lista-times-admin');
  const containerPartidas = document.getElementById('lista-partidas-admin');

  const inputData = document.getElementById('partida-data');
  if (inputData && !inputData.value) {
    inputData.value = `${obterDataLocalFormatada(1)}T16:00`;
  }

  try {
    const [carteiraCasa, usuarios, times, partidas] = await Promise.all([
      requisicaoApi('/desafios/carteira-casa'),
      requisicaoApi('/usuarios?pagina=0&tamanho=100'),
      requisicaoApi('/times?pagina=0&tamanho=100'),
      requisicaoApi('/partidas?pagina=0&tamanho=100'),
    ]);

    const elSaldoCasa = document.getElementById('admin-saldo-casa');
    const elTotalLiq = document.getElementById('admin-total-liquidadas');
    if (elSaldoCasa) elSaldoCasa.textContent = formatarMoeda(carteiraCasa?.saldoTotal || 0);
    if (elTotalLiq) elTotalLiq.textContent = String(carteiraCasa?.totalApostasLiquidadas || 0);

    const listaUsuarios = Array.isArray(usuarios) ? usuarios : [];
    const listaTimes = Array.isArray(times) ? times : [];
    const listaPartidas = Array.isArray(partidas) ? partidas : [];

    if (selectUsuarioCredito) {
      selectUsuarioCredito.innerHTML =
        `<option value="">Selecione um usuário para creditar saldo...</option>` +
        listaUsuarios
          .map(
            (u) =>
              `<option value="${u.id}">${escaparHtml(u.nome)} (${escaparHtml(u.email)}) — Saldo atual: ${formatarMoeda(u.saldo)}</option>`
          )
          .join('');
    }

    if (tbodyUsuarios) {
      tbodyUsuarios.innerHTML = listaUsuarios
        .map((u) => {
          const isAdm = (u.email || '').toLowerCase().startsWith('admin@');
          return `
            <tr>
              <td>#${u.id}</td>
              <td><strong>${escaparHtml(u.nome)}</strong></td>
              <td><code>${escaparHtml(u.email)}</code></td>
              <td><span class="badge ${isAdm ? 'badge-info' : 'badge-online'}">${isAdm ? 'ADMIN' : 'CLIENTE'}</span></td>
              <td class="col-direita"><strong class="destaque-verde">${formatarMoeda(u.saldo)}</strong></td>
              <td class="col-direita"><strong class="destaque-amarelo">${formatarMoeda(u.saldoRetido)}</strong></td>
            </tr>
          `;
        })
        .join('');
    }

    const opcoesTimes =
      `<option value="">Selecione um time...</option>` +
      listaTimes.map((t) => `<option value="${t.id}">${escaparHtml(t.nome)} (#${t.id})</option>`).join('');
    if (selectCasa) selectCasa.innerHTML = opcoesTimes;
    if (selectFora) selectFora.innerHTML = opcoesTimes;

    if (containerTimes) {
      containerTimes.innerHTML = listaTimes
        .map((t) => {
          const escudo = t.escudoUrl || ESCUDO_PADRAO;
          return `
            <div class="card-time-admin">
              <div class="info-time-admin">
                <img src="${escaparHtml(escudo)}" alt="${escaparHtml(t.nome)}" class="escudo-time" style="width:32px;height:32px;" onerror="this.src='${ESCUDO_PADRAO}'" />
                <span title="${escaparHtml(t.nome)}">${escaparHtml(t.nome)}</span>
              </div>
              <button type="button" class="btn btn-perigo btn-pequeno btn-remover-time" data-time-id="${t.id}" data-time-nome="${escaparHtml(t.nome)}">🗑️</button>
            </div>
          `;
        })
        .join('');

      containerTimes.querySelectorAll('.btn-remover-time').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = Number(btn.dataset.timeId);
          btn.disabled = true;
          try {
            await requisicaoApi(`/times/${id}`, { method: 'DELETE' });
            mostrarToast(`Time removido com sucesso!`);
            await carregarPainelAdmin();
          } catch (erro) {
            mostrarToast(erro.message, 'erro');
            btn.disabled = false;
          }
        });
      });
    }

    if (containerPartidas) {
      containerPartidas.innerHTML = listaPartidas
        .slice(0, 12)
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
                    <button type="submit" class="btn btn-primario btn-pequeno" title="Finalizar partida e liquidar apostas X1">
                      ✅ Finalizar &amp; Liquidar X1
                    </button>
                    <button type="button" class="btn btn-perigo btn-pequeno btn-remover-partida" data-partida-id="${p.id}" title="Excluir partida">
                      🗑️
                    </button>
                  </div>
                </form>
              </div>
            </article>
          `;
        })
        .join('');

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
            mostrarToast(`Partida #${id} finalizada (${placar})! Apostas X1 liquidadas e comissão de 5% creditada na Carteira Casa.`);
            await sincronizarDadosUsuarioLogado();
            await carregarPainelAdmin();
            await carregarPartidasArena();
          } catch (erro) {
            mostrarToast(erro.message, 'erro');
          }
        });
      });

      containerPartidas.querySelectorAll('.btn-remover-partida').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = Number(btn.dataset.partidaId);
          btn.disabled = true;
          try {
            await requisicaoApi(`/partidas/${id}`, { method: 'DELETE' });
            mostrarToast(`Partida #${id} removida!`);
            await carregarPainelAdmin();
            await carregarPartidasArena();
          } catch (erro) {
            mostrarToast(erro.message, 'erro');
            btn.disabled = false;
          }
        });
      });
    }
  } catch (erro) {
    if (containerPartidas) {
      containerPartidas.innerHTML = `<p class="texto-vazio">⚠️ API Quarkus offline (${escaparHtml(erro.message)}).</p>`;
    }
  }
}

async function creditarSaldoAdmin(evento) {
  evento.preventDefault();
  const usuarioId = Number(document.getElementById('credito-usuario-select').value);
  const valor = Number(document.getElementById('credito-valor').value);
  if (!usuarioId) {
    mostrarToast('Selecione um usuário!', 'erro');
    return;
  }

  try {
    const atualizado = await requisicaoApi(`/usuarios/${usuarioId}/creditar-saldo`, {
      method: 'POST',
      body: JSON.stringify({ valor }),
    });
    mostrarToast(
      `Crédito de ${formatarMoeda(valor)} adicionado para ${atualizado.nome}! Novo saldo: ${formatarMoeda(atualizado.saldo)}.`
    );
    await sincronizarDadosUsuarioLogado();
    await carregarPainelAdmin();
  } catch (erro) {
    mostrarToast(erro.message, 'erro');
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
    mostrarToast(`Time "${criado.nome}" cadastrado!`);
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
    mostrarToast(`Partida #${criada.id} agendada no Mural!`);
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
   7. INICIALIZAÇÃO
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
  aplicarModoVisual();

  // Navegação por abas (clicar direto em "🏟️ Mural de Partidas" sempre volta ao modo normal Desafio X1)
  document.querySelectorAll('.aba-btn').forEach((botao) => {
    botao.addEventListener('click', () => {
      if (botao.dataset.aba === 'partidas' && modoSelecaoBolaoAtivo) {
        desativarModoSelecaoBolao(true);
      }
      selecionarAba(botao.dataset.aba);
    });
  });

  // Login e Cadastro
  document.getElementById('form-login')?.addEventListener('submit', realizarLogin);
  document.getElementById('form-cadastro')?.addEventListener('submit', realizarCadastro);

  // Modal de Desafio X1
  document.getElementById('btn-fechar-modal-desafio')?.addEventListener('click', fecharModalDesafio);
  document.getElementById('btn-cancelar-modal-desafio')?.addEventListener('click', fecharModalDesafio);
  document.getElementById('form-criar-desafio')?.addEventListener('submit', enviarNovoDesafio);

  // Modal de Detalhes da Aposta
  document.getElementById('btn-fechar-modal-detalhe')?.addEventListener('click', () => {
    document.getElementById('modal-detalhe-aposta-overlay')?.classList.add('oculto');
  });

  // Botões da TheSportsDB (Modo Admin)
  document.getElementById('btn-hoje-amanha')?.addEventListener('click', async () => {
    preencherDatasHojeEAmanha();
    await carregarPartidasExternasHojeEAmanha();
  });
  document.getElementById('btn-buscar-externas')?.addEventListener('click', carregarPartidasExternasHojeEAmanha);
  document.getElementById('btn-importar-todas')?.addEventListener('click', () => importarTodasPartidasExternas(false));

  // Mural de Partidas e Minhas Apostas
  document.getElementById('btn-recarregar-arena')?.addEventListener('click', carregarPartidasArena);
  document.getElementById('filtro-status-arena')?.addEventListener('change', carregarPartidasArena);
  document.getElementById('btn-recarregar-palpites')?.addEventListener('click', carregarMinhasApostas);
  document.getElementById('filtro-escopo-palpites')?.addEventListener('change', carregarMinhasApostas);
  document.getElementById('btn-recarregar-ranking')?.addEventListener('click', carregarRanking);

  // Painel Admin
  document.getElementById('form-creditar-saldo')?.addEventListener('submit', creditarSaldoAdmin);
  document.getElementById('form-criar-time')?.addEventListener('submit', criarTimeManual);
  document.getElementById('form-criar-partida')?.addEventListener('submit', criarPartidaManual);
  document.getElementById('btn-recarregar-admin')?.addEventListener('click', carregarPainelAdmin);

  atualizarCabecalhoUsuario();
  preencherDatasHojeEAmanha();

  await carregarPartidasExternasHojeEAmanha();
  const online = await verificarStatusApi();
  await carregarDadosIniciais(online);
  appInicializado = true;

  // Reverifica a API, convites recebidos (Desafio X1 e Bolão) e placares em tempo real automaticamente
  let contadorCiclosTempoReal = 0;
  setInterval(async () => {
    const ok = await verificarStatusApi();
    if (!ok) return;
    if (obterSessao()?.usuarioId) {
      await carregarConvitesPendentes();
    }
    contadorCiclosTempoReal++;
    if (contadorCiclosTempoReal % 2 === 0) {
      await carregarPartidasExternasHojeEAmanha();
      await importarTodasPartidasExternas(true);
      await sincronizarDadosUsuarioLogado();
      if (document.getElementById('aba-boloes')?.classList.contains('ativa')) {
        await carregarMeusBoloes();
      } else if (document.getElementById('aba-palpites')?.classList.contains('ativa')) {
        await carregarMinhasApostas();
      }
    }
  }, 10000);
  inicializarEventosBolao();
});

/* ==========================================================================
   8. FUNÇÃO BOLÃO (SELEÇÃO MÚLTIPLA ✅, PLACARES, CONVITES, RANKING E REGRAS 11-14)
   ========================================================================== */

let modoSelecaoBolaoAtivo = false;
const partidasSelecionadasBolaoIds = new Set();
let placaresCriadorBolaoTemp = {};
let boloesCache = [];
let bolaoDetalheAtualId = null;
let partidaGrandeBolaoId = null;
let placaresConvidadoTemp = {};

const COMBINACOES_PADRAO_BOLAO = [
  '1x0', '2x0', '2x1', '3x0', '3x1', '3x2',
  '0x0', '1x1', '2x2',
  '0x1', '0x2', '1x2', '0x3', '1x3', '2x3',
];

function inicializarEventosBolao() {
  document.getElementById('btn-ativar-modo-x1')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    desativarModoSelecaoBolao(true);
    selecionarAba('partidas');
  });

  document.getElementById('btn-ativar-modo-bolao')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    ativarModoSelecaoBolao();
  });

  document.getElementById('btn-novo-bolao-atalho')?.addEventListener('click', () => {
    ativarModoSelecaoBolao();
  });

  document.getElementById('btn-sair-modo-bolao')?.addEventListener('click', () => {
    desativarModoSelecaoBolao(true);
  });

  document.getElementById('btn-confirmar-selecao-bolao')?.addEventListener('click', () => {
    abrirModalPartidasSelecionadasBolao();
  });

  document.getElementById('btn-fechar-modal-selecao-bolao')?.addEventListener('click', fecharModalSelecaoBolao);
  document.getElementById('btn-voltar-modal-selecao-bolao')?.addEventListener('click', fecharModalSelecaoBolao);
  document.getElementById('btn-salvar-bolao-ir-meus-boloes')?.addEventListener('click', salvarSelecaoEIrParaMeusBoloes);
  document.getElementById('btn-recarregar-boloes')?.addEventListener('click', carregarMeusBoloes);
}

function ativarModoSelecaoBolao() {
  const sessao = obterSessao();
  if (!sessao || !sessao.usuarioId) {
    mostrarToast('Faça login primeiro para criar um Bolão!', 'erro');
    selecionarAba('auth');
    return;
  }

  selecionarAba('partidas');
  modoSelecaoBolaoAtivo = true;
  partidasSelecionadasBolaoIds.clear();
  placaresCriadorBolaoTemp = {};

  document.getElementById('btn-ativar-modo-x1')?.classList.remove('ativo-submenu');
  document.getElementById('btn-ativar-modo-bolao')?.classList.add('ativo-submenu');
  document.getElementById('barra-modo-bolao')?.classList.remove('oculto');
  document.getElementById('barra-confirmar-selecao-bolao')?.classList.remove('oculto');
  renderizarPartidasArena(partidasArenaCache);
}

function desativarModoSelecaoBolao(reRenderizar = true) {
  modoSelecaoBolaoAtivo = false;
  partidasSelecionadasBolaoIds.clear();
  document.getElementById('btn-ativar-modo-x1')?.classList.add('ativo-submenu');
  document.getElementById('btn-ativar-modo-bolao')?.classList.remove('ativo-submenu');
  document.getElementById('barra-modo-bolao')?.classList.add('oculto');
  document.getElementById('barra-confirmar-selecao-bolao')?.classList.add('oculto');
  if (reRenderizar) {
    renderizarPartidasArena(partidasArenaCache);
  }
}

function alternarSelecaoPartidaBolao(partidaId) {
  const partida = partidasArenaCache.find((p) => Number(p.id) === Number(partidaId));
  if (!partida || partida.status === 'FINALIZADA') return;

  if (partidasSelecionadasBolaoIds.has(Number(partidaId))) {
    partidasSelecionadasBolaoIds.delete(Number(partidaId));
  } else {
    partidasSelecionadasBolaoIds.add(Number(partidaId));
  }
  renderizarPartidasArena(partidasArenaCache);
}

function fecharModalSelecaoBolao() {
  document.getElementById('modal-selecao-bolao-overlay')?.classList.add('oculto');
}

function abrirModalPartidasSelecionadasBolao() {
  if (partidasSelecionadasBolaoIds.size === 0) {
    mostrarToast('Marque ao menos uma partida com ✅ antes de clicar em Confirmar Seleção!', 'erro', 3000);
    return;
  }

  const selecionadas = partidasArenaCache.filter((p) => partidasSelecionadasBolaoIds.has(Number(p.id)));
  const container = document.getElementById('lista-vertical-selecao-bolao');
  if (!container) return;

  container.innerHTML = selecionadas
    .map((p, idx) => {
      const nomeCasa = p.timeCasa?.nome || 'Time Mandante';
      const nomeFora = p.timeFora?.nome || 'Time Visitante';
      const escudoCasa = p.timeCasa?.escudoUrl || ESCUDO_PADRAO;
      const escudoFora = p.timeFora?.escudoUrl || ESCUDO_PADRAO;
      const { data: dataBr, hora: horaBr } = extrairDataEHoraArena(p.data);
      const salvo = placaresCriadorBolaoTemp[p.id] || '';
      const [gCasa = '', gFora = ''] = salvo ? salvo.split('x') : ['', ''];

      return `
        <div class="item-vertical-bolao ${idx === 0 ? 'ativo' : ''} ${salvo ? 'preenchido' : ''}" data-item-bolao-partida="${p.id}">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <img src="${escaparHtml(escudoCasa)}" class="escudo-time" style="width:34px;height:34px;" onerror="this.src='${ESCUDO_PADRAO}'" />
              <strong>${escaparHtml(nomeCasa)}</strong>
              <span class="versus-label">x</span>
              <strong>${escaparHtml(nomeFora)}</strong>
              <img src="${escaparHtml(escudoFora)}" class="escudo-time" style="width:34px;height:34px;" onerror="this.src='${ESCUDO_PADRAO}'" />
            </div>
            <span class="badge ${salvo ? 'badge-online' : 'badge-aviso'}" id="badge-placar-criador-${p.id}">
              ${salvo ? `✅ Seu Placar: ${salvo.replace('x', ' x ')}` : `📅 ${escaparHtml(dataBr)} (${escaparHtml(horaBr)}) • Clique para definir placar`}
            </span>
          </div>

          <div class="caixas-placar-bolao">
            <span style="font-size:0.84rem;font-weight:700;">${escaparHtml(nomeCasa)}</span>
            <input
              type="number"
              min="0"
              max="99"
              placeholder="0"
              value="${escaparHtml(gCasa)}"
              class="input-padrao input-gols input-criador-casa"
              data-partida-id="${p.id}"
            />
            <span class="versus-label">x</span>
            <input
              type="number"
              min="0"
              max="99"
              placeholder="0"
              value="${escaparHtml(gFora)}"
              class="input-padrao input-gols input-criador-fora"
              data-partida-id="${p.id}"
            />
            <span style="font-size:0.84rem;font-weight:700;">${escaparHtml(nomeFora)}</span>
          </div>
        </div>
      `;
    })
    .join('');

  // Ao clicar em uma partida da lista vertical, abre as 2 caixinhas de placar dela
  container.querySelectorAll('.item-vertical-bolao').forEach((item) => {
    item.addEventListener('click', (ev) => {
      if (ev.target.tagName === 'INPUT') return;
      container.querySelectorAll('.item-vertical-bolao').forEach((el) => el.classList.remove('ativo'));
      item.classList.add('ativo');
      item.querySelector('.input-criador-casa')?.focus();
    });
  });

  // Atualiza em tempo real o placar digitado nas 2 caixinhas
  const atualizarPlacarItem = (pid) => {
    const item = container.querySelector(`[data-item-bolao-partida="${pid}"]`);
    if (!item) return;
    const valCasa = item.querySelector('.input-criador-casa')?.value.trim();
    const valFora = item.querySelector('.input-criador-fora')?.value.trim();
    const badge = document.getElementById(`badge-placar-criador-${pid}`);
    if (valCasa !== '' && valFora !== '') {
      placaresCriadorBolaoTemp[pid] = `${valCasa}x${valFora}`;
      item.classList.add('preenchido');
      if (badge) {
        badge.className = 'badge badge-online';
        badge.textContent = `✅ Seu Placar: ${valCasa} x ${valFora}`;
      }
    } else {
      delete placaresCriadorBolaoTemp[pid];
      item.classList.remove('preenchido');
      if (badge) {
        badge.className = 'badge badge-aviso';
        badge.textContent = 'Preencha as 2 caixinhas de placar';
      }
    }
  };

  container.querySelectorAll('.input-criador-casa, .input-criador-fora').forEach((inp) => {
    inp.addEventListener('input', () => atualizarPlacarItem(Number(inp.dataset.partidaId)));
  });

  document.getElementById('modal-selecao-bolao-overlay')?.classList.remove('oculto');
}

async function salvarSelecaoEIrParaMeusBoloes() {
  const sessao = obterSessao();
  if (!sessao || !sessao.usuarioId) return;

  const selecionadas = partidasArenaCache.filter((p) => partidasSelecionadasBolaoIds.has(Number(p.id)));
  const faltando = [];
  const palpitesPayload = [];

  selecionadas.forEach((p) => {
    const placar = placaresCriadorBolaoTemp[p.id];
    if (!placar) {
      faltando.push(`${p.timeCasa?.nome || 'Mandante'} x ${p.timeFora?.nome || 'Visitante'}`);
    } else {
      palpitesPayload.push({ partidaId: p.id, placar });
    }
  });

  if (faltando.length > 0) {
    faltando.forEach((nomeJogo) => {
      mostrarToast(`⚠️ Você esqueceu de marcar o placar de: ${nomeJogo}`, 'erro', 3000);
    });
    return;
  }

  try {
    const criado = await requisicaoApi('/boloes', {
      method: 'POST',
      body: JSON.stringify({
        criadorId: sessao.usuarioId,
        palpites: palpitesPayload,
      }),
    });

    fecharModalSelecaoBolao();
    desativarModoSelecaoBolao(true);
    bolaoDetalheAtualId = criado.id;
    mostrarToast(`Bolão #${criado.id} criado! Agora defina o valor do bolão e convide os participantes.`);
    selecionarAba('boloes');
  } catch (erro) {
    mostrarToast(erro.message, 'erro');
  }
}

function renderizarBoxConvidadosHover(participantes) {
  const convidados = (participantes || []).filter((p) => p.papel !== 'CRIADOR');
  if (convidados.length === 0) {
    return `<div class="convidados-hover-wrapper"><span>Nenhum convidado adicionado ainda (clique no bolão para convidar)</span></div>`;
  }

  const primeirosDois = convidados
    .slice(0, 2)
    .map((p) => `${p.usuario?.email || p.usuario?.nome} (${p.status})`)
    .join(', ');
  const extras = convidados.length > 2 ? ` +${convidados.length - 2} (passe o mouse para ver todos)` : '';

  const todosHtml = convidados
    .map(
      (p) =>
        `<div style="display:flex;justify-content:space-between;gap:8px;">
          <span>👤 ${escaparHtml(p.usuario?.nome)} (<code>${escaparHtml(p.usuario?.email)}</code>)</span>
          <span class="badge ${p.status === 'CONFIRMADO' || p.status === 'ACEITO' ? 'badge-online' : 'badge-aviso'}">${p.status}</span>
        </div>`
    )
    .join('');

  return `
    <div class="convidados-hover-wrapper" title="Passe o mouse para ver todos os usuários convidados">
      <div class="convidados-resumo">
        <span>📨 <strong>Convidados (${convidados.length}):</strong> ${escaparHtml(primeirosDois)}${escaparHtml(extras)}</span>
      </div>
      <div class="convidados-lista-completa">
        ${todosHtml}
      </div>
    </div>
  `;
}

async function carregarMeusBoloes() {
  const container = document.getElementById('lista-meus-boloes');
  const areaDetalhe = document.getElementById('area-bolao-detalhe');
  if (!container) return [];

  const sessao = obterSessao();
  if (!sessao || !sessao.usuarioId) {
    container.innerHTML = `
      <div class="texto-vazio">
        <p style="margin-bottom: 12px;">🔐 Entre na sua conta para acessar <strong>Meus Bolões</strong>.</p>
        <button type="button" id="btn-ir-login-boloes" class="btn btn-primario">Entrar / Criar Conta</button>
      </div>
    `;
    document.getElementById('btn-ir-login-boloes')?.addEventListener('click', () => selecionarAba('auth'));
    areaDetalhe?.classList.add('oculto');
    return [];
  }

  await sincronizarDadosUsuarioLogado();

  try {
    const query = ehAdmin() ? '' : `?usuarioId=${encodeURIComponent(sessao.usuarioId)}`;
    const lista = await requisicaoApi(`/boloes${query}`);
    boloesCache = Array.isArray(lista) ? lista : [];
    renderizarListaMeusBoloes(boloesCache);

    if (bolaoDetalheAtualId) {
      const existe = boloesCache.find((b) => Number(b.id) === Number(bolaoDetalheAtualId));
      if (existe) {
        await renderizarDetalheBolao(existe);
      } else {
        areaDetalhe?.classList.add('oculto');
      }
    }
    return boloesCache;
  } catch (erro) {
    container.innerHTML = `<p class="texto-vazio">⚠️ Erro ao carregar bolões: ${escaparHtml(erro.message)}</p>`;
    return [];
  }
}

function renderizarListaMeusBoloes(boloes) {
  const container = document.getElementById('lista-meus-boloes');
  if (!container) return;

  if (!boloes || boloes.length === 0) {
    container.innerHTML = `
      <p class="texto-vazio">
        🎲 Nenhum bolão encontrado. Passe o mouse em <strong>"🏟️ Mural de Partidas"</strong> ➔ clique em <strong>"🎲 Bolão"</strong> para selecionar as partidas!
      </p>
    `;
    return;
  }

  const sessao = obterSessao();

  container.innerHTML = boloes
    .map((b) => {
      const souCriador = sessao && Number(b.criador?.id) === Number(sessao.usuarioId);
      const minhaPart = (b.participantes || []).find((p) => Number(p.usuario?.id) === Number(sessao?.usuarioId));
      const qtdJogos = (b.partidas || []).length;
      const ativos = (b.participantes || []).filter(
        (p) => p.status === 'ACEITO' || p.status === 'CONFIRMADO'
      );
      const poteAtual = ativos.length * Number(b.valorCota || 0);

      let badgeStatus = `<span class="badge badge-aviso">${b.status}</span>`;
      if (b.status === 'ABERTO') {
        badgeStatus = `<span class="badge badge-info">🟢 ABERTO (${qtdJogos} Jogos)</span>`;
      } else if (b.status === 'FINALIZADO') {
        badgeStatus = `<span class="badge badge-online">🏆 FINALIZADO (Vencedor: ${escaparHtml(b.vencedor?.nome || '-')})</span>`;
      } else if (b.status === 'CANCELADO') {
        badgeStatus = `<span class="badge badge-offline">🚫 CANCELADO</span>`;
      }

      let rotuloAcao = '🔍 Abrir Bolão & Ranking';
      if (souCriador && b.status === 'RASCUNHO') {
        rotuloAcao = '⚙️ Definir Valor e Convidar Usuários';
      } else if (minhaPart && minhaPart.status === 'PENDENTE') {
        rotuloAcao = '🔔 Ver Card de Aceite do Bolão';
      } else if (minhaPart && minhaPart.status === 'ACEITO') {
        rotuloAcao = '🎯 Escolher Placares e Confirmar Aposta';
      }

      return `
        <article class="card-partida card-partida-clicavel" data-card-bolao-id="${b.id}">
          <div class="card-partida-topo">
            <span class="liga-tag">Bolão #${b.id} • Criador: ${escaparHtml(b.criador?.nome)}</span>
            ${badgeStatus}
          </div>

          <div class="comparativo-placares">
            <div class="caixa-placar-info">
              <span>💰 Valor por Pessoa</span>
              <strong class="destaque-verde">${formatarMoeda(b.valorCota)}</strong>
            </div>
            <div class="caixa-placar-info">
              <span>🏆 Pote (90% Vencedor / 10% Casa)</span>
              <strong class="destaque-azul">${formatarMoeda(poteAtual)}</strong>
            </div>
          </div>

          ${renderizarBoxConvidadosHover(b.participantes)}

          <div class="card-partida-rodape">
            <button type="button" class="btn btn-primario btn-bloco btn-abrir-bolao" data-bolao-id="${b.id}">
              ${rotuloAcao}
            </button>
          </div>
        </article>
      `;
    })
    .join('');

  container.querySelectorAll('[data-card-bolao-id]').forEach((card) => {
    card.addEventListener('click', () => {
      const id = Number(card.dataset.cardBolaoId);
      const bolao = boloesCache.find((x) => Number(x.id) === id);
      if (bolao) {
        bolaoDetalheAtualId = bolao.id;
        renderizarDetalheBolao(bolao);
      }
    });
  });
}

async function renderizarDetalheBolao(bolao) {
  const area = document.getElementById('area-bolao-detalhe');
  if (!area) return;
  area.classList.remove('oculto');

  const sessao = obterSessao();
  const souCriador = sessao && Number(bolao.criador?.id) === Number(sessao.usuarioId);
  const minhaPart = (bolao.participantes || []).find((p) => Number(p.usuario?.id) === Number(sessao?.usuarioId));
  const partidas = (bolao.partidas || []).map((bp) => bp.partida).filter(Boolean);

  // 1) Se for CONVIDADO com status PENDENTE -> Passo 7: Card de Aceite com todas as partidas de cima para baixo, valor e Aceitar/Recusar
  if (minhaPart && minhaPart.status === 'PENDENTE' && bolao.status === 'ABERTO') {
    const listaJogosHtml = partidas
      .map((p, idx) => {
        const nomeCasa = p.timeCasa?.nome || 'Time Casa';
        const nomeFora = p.timeFora?.nome || 'Time Fora';
        const escudoCasa = p.timeCasa?.escudoUrl || ESCUDO_PADRAO;
        const escudoFora = p.timeFora?.escudoUrl || ESCUDO_PADRAO;
        const { placarExibicao } = obterEstadoTempoRealPartida(p);
        const { data: dBr, hora: hBr } = extrairDataEHoraArena(p.data);
        return `
          <div class="item-vertical-bolao" style="cursor:default;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px;">
              <span class="liga-tag">Jogo ${idx + 1} • Partida #${p.id}</span>
              <span class="badge badge-info">📅 ${escaparHtml(dBr)} (${escaparHtml(hBr)})</span>
            </div>
            <div class="confronto">
              <div class="time-bloco">
                <img src="${escaparHtml(escudoCasa)}" alt="${escaparHtml(nomeCasa)}" class="escudo-time" onerror="this.src='${ESCUDO_PADRAO}'" />
                <span class="nome-time">${escaparHtml(nomeCasa)}</span>
              </div>
              <div class="placar-central">
                <span class="placar-numero">${escaparHtml(placarExibicao)}</span>
                <span class="versus-label">📅 ${escaparHtml(dBr)}</span>
                <span class="horario-partida">🕒 ${escaparHtml(hBr)}</span>
              </div>
              <div class="time-bloco">
                <img src="${escaparHtml(escudoFora)}" alt="${escaparHtml(nomeFora)}" class="escudo-time" onerror="this.src='${ESCUDO_PADRAO}'" />
                <span class="nome-time">${escaparHtml(nomeFora)}</span>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    area.innerHTML = `
      <div class="painel-card painel-convites">
        <h2>🔔 Card de Aceite do Bolão #${bolao.id} (Criado por ${escaparHtml(bolao.criador?.nome)})</h2>
        <p>Confira todas as partidas deste bolão de cima para baixo (role com o mouse para ver todas):</p>
        <div class="lista-vertical-bolao" style="max-height:260px;">
          ${listaJogosHtml}
        </div>
        <div style="margin-top:16px;padding:14px;background:rgba(15,23,42,0.75);border-radius:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
          <div>
            <span style="font-size:0.85rem;color:var(--texto-secundario);">Valor de Entrada do Bolão:</span>
            <strong class="destaque-verde" style="font-size:1.35rem;margin-left:8px;">${formatarMoeda(bolao.valorCota)}</strong>
          </div>
          <div style="display:flex;gap:10px;">
            <button type="button" id="btn-aceitar-convite-bolao" class="btn btn-primario">
              ✅ Aceitar Bolão (Reter ${formatarMoeda(bolao.valorCota)})
            </button>
            <button type="button" id="btn-recusar-convite-bolao" class="btn btn-perigo">
              ❌ Recusar
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-aceitar-convite-bolao')?.addEventListener('click', async () => {
      try {
        const atualizado = await requisicaoApi(`/boloes/${bolao.id}/aceitar`, {
          method: 'POST',
          body: JSON.stringify({ usuarioId: sessao.usuarioId }),
        });
        placaresConvidadoTemp = {};
        partidaGrandeBolaoId = partidas[0]?.id || null;
        mostrarToast(`Você aceitou o Bolão #${bolao.id}! Agora clique em cada partida para escolher seus placares.`);
        await carregarMeusBoloes();
        await renderizarDetalheBolao(atualizado);
      } catch (erro) {
        mostrarToast(erro.message, 'erro');
      }
    });

    document.getElementById('btn-recusar-convite-bolao')?.addEventListener('click', async () => {
      try {
        await requisicaoApi(`/boloes/${bolao.id}/recusar`, {
          method: 'POST',
          body: JSON.stringify({ usuarioId: sessao.usuarioId }),
        });
        mostrarToast(`Convite do Bolão #${bolao.id} recusado.`);
        await carregarMeusBoloes();
      } catch (erro) {
        mostrarToast(erro.message, 'erro');
      }
    });
    return;
  }

  // 2) Se for CONVIDADO com status ACEITO (Passos 8 e 9): clicar numa partida abre ela GRANDE com combinações riscadas à esquerda e livres à direita + botão amarelo Confirmar Aposta
  if (minhaPart && minhaPart.status === 'ACEITO' && bolao.status === 'ABERTO') {
    if (!partidaGrandeBolaoId && partidas.length > 0) {
      partidaGrandeBolaoId = partidas[0].id;
    }
    const partidaEmFoco = partidas.find((p) => Number(p.id) === Number(partidaGrandeBolaoId)) || partidas[0];
    const htmlPalcoGrande = montarPalcoGrandePartidaBolao(bolao, partidaEmFoco, sessao.usuarioId);

    const listaPartidasNavegacao = partidas
      .map((p, idx) => {
        const marcado = placaresConvidadoTemp[p.id];
        const emFoco = Number(p.id) === Number(partidaEmFoco?.id);
        return `
          <div class="item-vertical-bolao ${emFoco ? 'ativo' : ''}" data-nav-partida-bolao="${p.id}">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
              <strong>${idx + 1}. ${escaparHtml(p.timeCasa?.nome)} x ${escaparHtml(p.timeFora?.nome)}</strong>
              <span class="badge ${marcado ? 'badge-online' : 'badge-aviso'}">
                ${marcado ? `✅ Marcado: ${marcado.replace('x', ' x ')}` : '⏳ Clique para abrir grande e escolher'}
              </span>
            </div>
          </div>
        `;
      })
      .join('');

    area.innerHTML = `
      <div class="painel-card">
        <div class="cabecalho-secao">
          <div>
            <h2>🎯 Escolha seus Placares no Bolão #${bolao.id}</h2>
            <p>Clique em cada partida abaixo para abri-la grande na tela. À esquerda aparecem riscadas as combinações já jogadas e à direita as combinações disponíveis.</p>
          </div>
          <button type="button" id="btn-desistir-bolao-aceito" class="btn btn-perigo btn-pequeno">
            🏳️ Desistir do Bolão (Multa de 20%)
          </button>
        </div>

        ${htmlPalcoGrande}

        <h3 style="font-size:1rem;margin-top:14px;">Lista de Todas as Partidas do Bolão (${partidas.length}):</h3>
        <div class="lista-vertical-bolao">
          ${listaPartidasNavegacao}
        </div>

        <div style="display:flex;justify-content:center;margin-top:20px;">
          <button type="button" id="btn-confirmar-aposta-bolao" class="btn-amarelo-confirmar">
            Confirmar Aposta
          </button>
        </div>
      </div>
    `;

    vincularEventosPalcoGrandeEConfirmacao(bolao, partidas);
    return;
  }

  // 3) Visão do Bolão (Passo 6: configurar valor apenas na criação/rascunho; depois que já tem valor e nenhuma partida começou, exibe somente "Convidar mais participantes")
  const nenhumaPartidaIniciadaComGolOuEncerrada = !partidas.some((p) => {
    if (p.status === 'FINALIZADA') return true;
    if (p.placar && p.placar.trim() !== '' && p.placar.trim() !== '0x0') return true;
    return false;
  });

  let blocoConfigCriador = '';
  if (souCriador && bolao.status === 'RASCUNHO') {
    blocoConfigCriador = `
      <div class="bloco-detalhe-x1" style="border-color:#eab308;margin-bottom:18px;">
        <h3 style="font-size:1.05rem;margin-bottom:8px;">⚙️ Definir Valor Inicial do Bolão &amp; Convidar Participantes</h3>
        <form id="form-configurar-bolao" class="formulario" style="margin-top:8px;">
          <div class="grade-dupla">
            <div class="campo-form">
              <label for="bolao-input-valor">Valor do Bolão por Participante (R$)</label>
              <input type="number" id="bolao-input-valor" class="input-padrao" min="1" step="0.01" value="50.00" required />
            </div>
            <div class="campo-form">
              <label for="bolao-input-emails">E-mails dos Usuários Convidados (separe por vírgula)</label>
              <input type="text" id="bolao-input-emails" list="lista-emails-sugeridos" class="input-padrao" value="" placeholder="usuario1@gmail.com , usuario2@gmail.com" required />
            </div>
          </div>
          <button type="submit" class="btn btn-primario">📨 Inicializar Valor e Enviar Convites do Bolão</button>
        </form>
      </div>
    `;
  } else if (souCriador && bolao.status === 'ABERTO' && nenhumaPartidaIniciadaComGolOuEncerrada) {
    blocoConfigCriador = `
      <div class="bloco-detalhe-x1" style="border-color:#eab308;margin-bottom:18px;">
        <h3 style="font-size:1.05rem;margin-bottom:8px;">📨 Convidar mais participantes</h3>
        <form id="form-configurar-bolao" class="formulario" style="margin-top:8px;">
          <input type="hidden" id="bolao-input-valor" value="${Number(bolao.valorCota).toFixed(2)}" />
          <div class="campo-form">
            <label for="bolao-input-emails">E-mails dos Novos Convidados (separe por vírgula)</label>
            <input type="text" id="bolao-input-emails" list="lista-emails-sugeridos" class="input-padrao" value="" placeholder="usuario1@gmail.com , usuario2@gmail.com" required />
          </div>
          <button type="submit" class="btn btn-primario">📨 Convidar mais participantes</button>
        </form>
      </div>
    `;
  }

  // Verifica se o criador pode cancelar (Regra 11) ou se o convidado pode desistir com multa de 20% (Regra 13)
  let botaoCancelamentoOuDesistencia = '';
  if (bolao.status !== 'FINALIZADO' && bolao.status !== 'CANCELADO') {
    if (souCriador) {
      botaoCancelamentoOuDesistencia = `
        <button type="button" id="btn-cancelar-bolao-criador" class="btn btn-perigo btn-pequeno">
          🚫 Cancelar Bolão (Só se ninguém aceitou ou todos desistiram)
        </button>
      `;
    } else if (minhaPart && (minhaPart.status === 'ACEITO' || minhaPart.status === 'CONFIRMADO')) {
      botaoCancelamentoOuDesistencia = `
        <button type="button" id="btn-desistir-bolao-confirmado" class="btn btn-perigo btn-pequeno">
          🏳️ Desistir do Bolão (Devolve 80% / Multa 20%)
        </button>
      `;
    }
  }

  // Lista de todas as partidas daquele bolão (esquerda/centro) — com a caixinha visual de confronto igual ao Mural
  const listaPartidasConfirmadasHtml = partidas
    .map((p, idx) => {
      const nomeCasa = p.timeCasa?.nome || 'Time Casa';
      const nomeFora = p.timeFora?.nome || 'Time Fora';
      const escudoCasa = p.timeCasa?.escudoUrl || ESCUDO_PADRAO;
      const escudoFora = p.timeFora?.escudoUrl || ESCUDO_PADRAO;
      const { placarExibicao, aoVivo, finalizada } = obterEstadoTempoRealPartida(p);
      const meuPalpiteObj = (bolao.palpites || []).find(
        (pal) => Number(pal.partida?.id) === Number(p.id) && Number(pal.usuario?.id) === Number(sessao?.usuarioId)
      );
      const todosPalpitesJogo = (bolao.palpites || []).filter((pal) => Number(pal.partida?.id) === Number(p.id));
      const { data: dBr, hora: hBr } = extrairDataEHoraArena(p.data);

      const badgeStatusJogo = finalizada
        ? `<span class="badge badge-online">✅ FINALIZADA (${escaparHtml(placarExibicao)})</span>`
        : aoVivo
        ? `<span class="badge badge-info">🔴 AO VIVO (${escaparHtml(placarExibicao)})</span>`
        : `<span class="badge badge-aviso">📅 ${escaparHtml(dBr)} (${escaparHtml(hBr)})</span>`;

      return `
        <div class="item-vertical-bolao" style="cursor:default;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
            <strong>${idx + 1}. ${escaparHtml(nomeCasa)} x ${escaparHtml(nomeFora)}</strong>
            ${badgeStatusJogo}
          </div>

          <div class="confronto" style="margin: 8px 0;">
            <div class="time-bloco">
              <img src="${escaparHtml(escudoCasa)}" alt="${escaparHtml(nomeCasa)}" class="escudo-time" onerror="this.src='${ESCUDO_PADRAO}'" />
              <span class="nome-time">${escaparHtml(nomeCasa)}</span>
            </div>

            <div class="placar-central">
              <span class="placar-numero">${escaparHtml(placarExibicao)}</span>
              <span class="versus-label">📅 ${escaparHtml(dBr)}</span>
              <span class="horario-partida">🕒 ${escaparHtml(hBr)}</span>
            </div>

            <div class="time-bloco">
              <img src="${escaparHtml(escudoFora)}" alt="${escaparHtml(nomeFora)}" class="escudo-time" onerror="this.src='${ESCUDO_PADRAO}'" />
              <span class="nome-time">${escaparHtml(nomeFora)}</span>
            </div>
          </div>

          <div style="margin-top:8px;font-size:0.86rem;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
            <span>🎯 Seu Palpite: <strong class="destaque-verde">${escaparHtml(meuPalpiteObj?.placarPrevisto ? meuPalpiteObj.placarPrevisto.replace('x', ' x ') : '-')}</strong></span>
            <span>Pontos ganhos: <strong class="destaque-azul">${meuPalpiteObj?.pontosObtidos ?? 0} pts</strong></span>
          </div>
          <div style="margin-top:6px;font-size:0.78rem;color:var(--texto-secundario);">
            Combinações jogadas neste jogo: ${todosPalpitesJogo.map((tp) => `${escaparHtml(tp.usuario?.nome)}: <strong>${escaparHtml(tp.placarPrevisto)}</strong>`).join(' • ') || 'Nenhuma'}
          </div>
        </div>
      `;
    })
    .join('');

  // Ranking exclusivo daquele bolão na lateral direita (de cima para baixo — Passo 10)
  const participantesAtivosOrdenados = [...(bolao.participantes || [])]
    .filter((p) => p.status === 'CONFIRMADO' || p.status === 'ACEITO')
    .sort((a, b) => Number(b.pontosTotais || 0) - Number(a.pontosTotais || 0));

  const rankingBolaoLateralHtml = participantesAtivosOrdenados
    .map((p, idx) => {
      const medalhas = ['🥇 1º', '🥈 2º', '🥉 3º'];
      const pos = medalhas[idx] || `${idx + 1}º`;
      return `
        <div class="item-ranking-bolao">
          <div>
            <strong>${pos} — ${escaparHtml(p.usuario?.nome)}</strong>
            <div style="font-size:0.75rem;color:var(--texto-secundario);">${escaparHtml(p.usuario?.email)}</div>
          </div>
          <span class="pontos-pill">${Number(p.pontosTotais || 0)} pts</span>
        </div>
      `;
    })
    .join('');

  const poteTotal = participantesAtivosOrdenados.length * Number(bolao.valorCota || 0);
  const comissao10 = poteTotal * 0.1;
  const premio90 = poteTotal - comissao10;

  area.innerHTML = `
    <div class="painel-card">
      <div class="cabecalho-secao">
        <div>
          <h2>🎲 Detalhes do Bolão #${bolao.id} — Status: ${bolao.status}</h2>
          <p>Valor por participante: <strong>${formatarMoeda(bolao.valorCota)}</strong> • Pote Total: <strong>${formatarMoeda(poteTotal)}</strong> (Prêmio Vencedor 90%: <strong class="destaque-verde">${formatarMoeda(premio90)}</strong> | Comissão da Casa 10%: <strong class="destaque-amarelo">${formatarMoeda(comissao10)}</strong>)</p>
        </div>
        ${botaoCancelamentoOuDesistencia}
      </div>

      ${blocoConfigCriador}
      ${renderizarBoxConvidadosHover(bolao.participantes)}

      <div class="layout-bolao-ranking-lateral">
        <div>
          <h3 style="font-size:1.05rem;margin-bottom:10px;">🏟️ Partidas deste Bolão (${partidas.length})</h3>
          <div class="lista-vertical-bolao" style="max-height:none;">
            ${listaPartidasConfirmadasHtml}
          </div>
        </div>

        <aside class="lateral-direita-ranking-bolao">
          <h3 style="font-size:1.05rem;">🏆 Ranking do Bolão #${bolao.id}</h3>
          <p style="font-size:0.8rem;color:var(--texto-secundario);margin-bottom:6px;">Classificação de cima para baixo por pontos acumulados nos jogos do bolão:</p>
          ${rankingBolaoLateralHtml || '<p class="texto-vazio">Nenhum participante ativo.</p>'}
        </aside>
      </div>
    </div>
  `;

  document.getElementById('form-configurar-bolao')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const valorCota = Number(document.getElementById('bolao-input-valor').value);
    const bruto = document.getElementById('bolao-input-emails').value;
    const emailsConvidados = bruto
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter(Boolean);

    try {
      const atualizado = await requisicaoApi(`/boloes/${bolao.id}/configurar`, {
        method: 'POST',
        body: JSON.stringify({
          usuarioId: sessao.usuarioId,
          valorCota,
          emailsConvidados,
        }),
      });
      mostrarToast(
        `📨 Convite(s) do Bolão #${bolao.id} enviado(s) com sucesso para ${emailsConvidados.join(', ')} (Valor: ${formatarMoeda(valorCota)})!`,
        'sucesso',
        8000
      );
      await carregarMeusBoloes();
      await renderizarDetalheBolao(atualizado);
    } catch (erro) {
      mostrarToast(erro.message, 'erro');
    }
  });

  document.getElementById('btn-cancelar-bolao-criador')?.addEventListener('click', async () => {
    try {
      await requisicaoApi(`/boloes/${bolao.id}/cancelar`, {
        method: 'POST',
        body: JSON.stringify({ usuarioId: sessao.usuarioId }),
      });
      mostrarToast(`Bolão #${bolao.id} cancelado e valor estornado para sua conta!`);
      await carregarMeusBoloes();
    } catch (erro) {
      mostrarToast(erro.message, 'erro');
    }
  });

  document.getElementById('btn-desistir-bolao-confirmado')?.addEventListener('click', async () => {
    await executarDesistenciaBolao(bolao.id, sessao.usuarioId);
  });
}

function montarPalcoGrandePartidaBolao(bolao, partida, meuUsuarioId) {
  if (!partida) return '';
  const nomeCasa = partida.timeCasa?.nome || 'Time Mandante';
  const nomeFora = partida.timeFora?.nome || 'Time Visitante';
  const escudoCasa = partida.timeCasa?.escudoUrl || ESCUDO_PADRAO;
  const escudoFora = partida.timeFora?.escudoUrl || ESCUDO_PADRAO;

  // Combinações já jogadas por outros participantes ativos nesta partida
  const jaJogadasSet = new Set(
    (bolao.palpites || [])
      .filter(
        (pal) =>
          Number(pal.partida?.id) === Number(partida.id) &&
          Number(pal.usuario?.id) !== Number(meuUsuarioId)
      )
      .map((pal) => (pal.placarPrevisto || '').toLowerCase())
      .filter(Boolean)
  );

  const listaRiscadas = Array.from(jaJogadasSet);
  const listaLivres = COMBINACOES_PADRAO_BOLAO.filter((c) => !jaJogadasSet.has(c));

  const salvo = placaresConvidadoTemp[partida.id] || '';
  const [gCasa = '', gFora = ''] = salvo ? salvo.split('x') : ['', ''];

  return `
    <div class="palco-grande-bolao">
      <!-- Lado Esquerdo: Combinações já jogadas (Riscadas) -->
      <div class="coluna-combinacoes">
        <strong style="font-size:0.86rem;color:#fca5a5;">🚫 Combinações Já Jogadas (Riscadas)</strong>
        <small style="font-size:0.75rem;color:var(--texto-secundario);">Estes placares já foram escolhidos nesta partida:</small>
        <div class="grade-pills-placar">
          ${
            listaRiscadas.length > 0
              ? listaRiscadas.map((c) => `<span class="pill-placar-riscado">${escaparHtml(c.replace('x', ' x '))}</span>`).join('')
              : `<span style="font-size:0.8rem;color:var(--texto-secundario);">Nenhuma combinação ocupada ainda.</span>`
          }
        </div>
      </div>

      <!-- Centro: Partida Grande na Tela -->
      <div class="card-central-grande">
        <span class="badge badge-aviso">PARTIDA EM DESTAQUE • #${partida.id}</span>
        <div style="display:flex;align-items:center;justify-content:center;gap:18px;flex-wrap:wrap;">
          <div class="time-bloco">
            <img src="${escaparHtml(escudoCasa)}" class="escudo-time" onerror="this.src='${ESCUDO_PADRAO}'" />
            <span class="nome-time">${escaparHtml(nomeCasa)}</span>
          </div>
          <div class="placar-inputs">
            <input type="number" min="0" max="99" id="input-grande-casa" value="${escaparHtml(gCasa)}" placeholder="0" class="input-padrao input-gols" style="width:64px;font-size:1.25rem;" />
            <span class="versus-label" style="font-size:1.1rem;">X</span>
            <input type="number" min="0" max="99" id="input-grande-fora" value="${escaparHtml(gFora)}" placeholder="0" class="input-padrao input-gols" style="width:64px;font-size:1.25rem;" />
          </div>
          <div class="time-bloco">
            <img src="${escaparHtml(escudoFora)}" class="escudo-time" onerror="this.src='${ESCUDO_PADRAO}'" />
            <span class="nome-time">${escaparHtml(nomeFora)}</span>
          </div>
        </div>
        <small style="color:var(--texto-secundario);">Digite nas caixinhas acima ou clique em uma combinação disponível à direita.</small>
      </div>

      <!-- Lado Direito: Combinações que ainda podem ser feitas -->
      <div class="coluna-combinacoes">
        <strong style="font-size:0.86rem;color:#34d399;">✅ Combinações Disponíveis</strong>
        <small style="font-size:0.75rem;color:var(--texto-secundario);">Clique em uma combinação para preencher o placar:</small>
        <div class="grade-pills-placar">
          ${listaLivres
            .map(
              (c) =>
                `<button type="button" class="pill-placar-livre" data-combinacao-livre="${c}">${escaparHtml(c.replace('x', ' x '))}</button>`
            )
            .join('')}
        </div>
      </div>
    </div>
  `;
}

function vincularEventosPalcoGrandeEConfirmacao(bolao, partidas) {
  const sessao = obterSessao();
  const partidaEmFoco = partidas.find((p) => Number(p.id) === Number(partidaGrandeBolaoId)) || partidas[0];

  const salvarInputsAtuais = () => {
    if (!partidaEmFoco) return;
    const c = document.getElementById('input-grande-casa')?.value.trim();
    const f = document.getElementById('input-grande-fora')?.value.trim();
    if (c !== '' && f !== '') {
      placaresConvidadoTemp[partidaEmFoco.id] = `${c}x${f}`;
    } else {
      delete placaresConvidadoTemp[partidaEmFoco.id];
    }
  };

  document.getElementById('input-grande-casa')?.addEventListener('input', salvarInputsAtuais);
  document.getElementById('input-grande-fora')?.addEventListener('input', salvarInputsAtuais);

  document.querySelectorAll('[data-combinacao-livre]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const comb = btn.dataset.combinacaoLivre;
      if (!comb || !partidaEmFoco) return;
      placaresConvidadoTemp[partidaEmFoco.id] = comb;
      renderizarDetalheBolao(bolao);
    });
  });

  document.querySelectorAll('[data-nav-partida-bolao]').forEach((item) => {
    item.addEventListener('click', () => {
      salvarInputsAtuais();
      partidaGrandeBolaoId = Number(item.dataset.navPartidaBolao);
      renderizarDetalheBolao(bolao);
    });
  });

  document.getElementById('btn-desistir-bolao-aceito')?.addEventListener('click', async () => {
    await executarDesistenciaBolao(bolao.id, sessao.usuarioId);
  });

  // Passo 9: Botão amarelo "Confirmar Aposta" — alerta de 3 segundos no canto direito para cada partida esquecida
  document.getElementById('btn-confirmar-aposta-bolao')?.addEventListener('click', async () => {
    salvarInputsAtuais();
    const esquecidas = [];
    const payload = [];

    partidas.forEach((p) => {
      const placar = placaresConvidadoTemp[p.id];
      if (!placar) {
        esquecidas.push(`${p.timeCasa?.nome || 'Mandante'} x ${p.timeFora?.nome || 'Visitante'}`);
      } else {
        payload.push({ partidaId: p.id, placar });
      }
    });

    if (esquecidas.length > 0) {
      esquecidas.forEach((jogo) => {
        mostrarToast(`⚠️ Você esqueceu de marcar um resultado na partida: ${jogo}`, 'erro', 3000);
      });
      return;
    }

    try {
      const confirmado = await requisicaoApi(`/boloes/${bolao.id}/confirmar-aposta`, {
        method: 'POST',
        body: JSON.stringify({
          usuarioId: sessao.usuarioId,
          palpites: payload,
        }),
      });
      mostrarToast(`Aposta confirmada no Bolão #${bolao.id}! Confira as partidas e o ranking na lateral direita.`);
      await carregarMeusBoloes();
      await renderizarDetalheBolao(confirmado);
    } catch (erro) {
      mostrarToast(erro.message, 'erro');
    }
  });
}

async function executarDesistenciaBolao(bolaoId, usuarioId) {
  try {
    await requisicaoApi(`/boloes/${bolaoId}/desistir`, {
      method: 'POST',
      body: JSON.stringify({ usuarioId }),
    });
    mostrarToast(
      `Você desistiu do Bolão #${bolaoId}. O valor foi devolvido para sua conta com desconto da penalidade de 20% (enviada à Carteira Casa).`
    );
    await carregarMeusBoloes();
  } catch (erro) {
    mostrarToast(erro.message, 'erro');
  }
}
