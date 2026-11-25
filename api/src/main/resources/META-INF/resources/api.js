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
    carregarMinhasApostas();
  } else if (idAba === 'ranking') {
    carregarRanking();
  } else if (idAba === 'admin') {
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
  const partidas = await carregarPartidasArena();
  const chavesBanco = new Set(partidasArenaCache.map((p) => chaveConfronto(p.timeCasa?.nome, p.timeFora?.nome)));
  const faltam = partidasExternasCache.some((ev) => !chavesBanco.has(chaveConfronto(ev.strHomeTeam, ev.strAwayTeam)));
  if (faltam || partidas.length === 0) {
    await importarTodasPartidasExternas(true);
  }
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

    // Mantém as 9 partidas principais para o Mural de Partidas
    partidasExternasCache = lista.slice(0, LIMITE_MURAL_PARTIDAS);
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

  const partidaExistente = (partidasAtuais || []).find(
    (p) => p.timeCasa?.id === timeCasa.id && p.timeFora?.id === timeFora.id
  );
  if (partidaExistente) {
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
      const finalizada = p.status === 'FINALIZADA';
      const placarExibicao = p.placar ? p.placar.replace('x', ' x ') : 'VS';
      const { data: dataBr, hora: horaBr } = extrairDataEHoraArena(p.data);

      const badgeStatus = finalizada
        ? `<span class="badge badge-online">✅ FINALIZADA</span>`
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

      return `
        <article class="card-partida ${!finalizada ? 'card-partida-clicavel' : ''}" data-card-partida-id="${p.id}">
          <div class="card-partida-topo">
            <span class="liga-tag">Jogo #${p.id} • 📅 ${escaparHtml(dataBr)}</span>
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

  // Ao clicar no botão ou no card da partida, abre o Card de Desafio X1
  container.querySelectorAll('.btn-abrir-desafio').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      abrirModalDesafio(Number(btn.dataset.partidaId));
    });
  });

  container.querySelectorAll('.card-partida-clicavel').forEach((card) => {
    card.addEventListener('click', (ev) => {
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
      `Desafio X1 #${criado.id} enviado para ${emailDesafiado}! Valor de ${formatarMoeda(valor)} retido e aviso de e-mail disparado.`
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

    if (pendentesParaMim.length === 0) {
      secao.classList.add('oculto');
      return;
    }

    secao.classList.remove('oculto');
    container.innerHTML = pendentesParaMim.map((d) => montarCardConviteParaAceite(d)).join('');
    registrarEventosAceiteRecusa(container);
  } catch {
    secao.classList.add('oculto');
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
        <span>👤 Desafiante (Usuário A)</span>
        <strong>${escaparHtml(d.desafiante?.nome)} (${escaparHtml(d.desafiante?.email)})</strong>
      </div>
      <div class="linha-detalhe-x1">
        <span>🎯 Opção do Desafiante (A)</span>
        <strong class="destaque-verde">${escaparHtml(traduzirOpcaoDesafio(d.opcaoDesafiante, partida))}</strong>
      </div>
      <div class="linha-detalhe-x1">
        <span>⚔️ Desafiado (Usuário B)</span>
        <strong>${escaparHtml(d.desafiado?.nome)} (${escaparHtml(d.desafiado?.email)})</strong>
      </div>
      <div class="linha-detalhe-x1">
        <span>🎯 Opção do Desafiado (B)</span>
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
        <span>🏟️ Status da Partida / Placar Oficial</span>
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

  // Navegação por abas
  document.querySelectorAll('.aba-btn').forEach((botao) => {
    botao.addEventListener('click', () => selecionarAba(botao.dataset.aba));
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

  // Reverifica a API a cada 10s: se ela estiver fora do ar e voltar, o site se recupera sozinho
  setInterval(verificarStatusApi, 10000);
});
