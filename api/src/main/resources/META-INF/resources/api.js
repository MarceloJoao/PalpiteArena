/**
 * Etapa 1 — Cliente HTTP centralizado da PalpiteArena (api.js)
 * - Envia automaticamente o cabeçalho Authorization: Bearer <token> quando logado;
 * - Traduz respostas de erro no formato Problem Details (RFC 9457) da API Quarkus;
 * - Exibe alertas visuais (toasts) e verifica a saúde da API (/q/health/live).
 */

const CHAVE_SESSAO = 'palpitearena_sessao';

// Detecta se está rodando servido pela própria API (local :8080 ou nuvem Render) ou aberto via Live Server / arquivo local
const API_BASE_URL =
  window.location.protocol === 'file:' || window.location.port === '5500'
    ? 'http://localhost:8080'
    : '';

/**
 * Lê a sessão salva no navegador (token JWT + dados do usuário).
 */
function obterSessao() {
  try {
    const bruto = localStorage.getItem(CHAVE_SESSAO);
    return bruto ? JSON.parse(bruto) : null;
  } catch {
    return null;
  }
}

/**
 * Salva ou remove a sessão do usuário no localStorage.
 */
function salvarSessao(dadosLogin) {
  if (!dadosLogin) {
    localStorage.removeItem(CHAVE_SESSAO);
  } else {
    localStorage.setItem(CHAVE_SESSAO, JSON.stringify(dadosLogin));
  }
}

/**
 * Faz uma chamada HTTP para a API Quarkus e trata erros RFC 9457 (application/problem+json).
 */
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

/**
 * Extrai uma mensagem legível a partir do JSON Problem Details (RFC 9457) retornado pelo Quarkus.
 */
function extrairErroProblemDetails(problema, statusHttp) {
  if (!problema || typeof problema !== 'object') {
    return new Error(`Erro HTTP ${statusHttp} ao comunicar com a API.`);
  }

  // Se houver lista de campos inválidos do Bean Validation (campo + mensagem)
  if (Array.isArray(problema.errors) && problema.errors.length > 0) {
    const detalhesCampos = problema.errors
      .map((e) => `${e.campo}: ${e.mensagem}`)
      .join(' | ');
    return new Error(`${problema.title || 'Dados inválidos'} — ${detalhesCampos}`);
  }

  const mensagem = problema.detail || problema.title || `Erro HTTP ${statusHttp}`;
  return new Error(mensagem);
}

/**
 * Exibe uma notificação flutuante (toast) no canto da tela.
 */
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
  }, 4200);
}

/**
 * Alterna entre as abas de navegação da interface.
 */
function selecionarAba(idAba) {
  document.querySelectorAll('.aba-conteudo').forEach((secao) => {
    secao.classList.toggle('ativa', secao.id === `aba-${idAba}`);
  });
  document.querySelectorAll('.aba-btn').forEach((botao) => {
    botao.classList.toggle('ativa', botao.dataset.aba === idAba);
  });
}

/**
 * Verifica se a API Quarkus está online consultando /q/health/live.
 */
async function verificarStatusApi() {
  const indicador = document.getElementById('status-api');
  if (!indicador) return;

  try {
    const saude = await requisicaoApi('/q/health/live');
    if (saude && saude.status === 'UP') {
      indicador.textContent = '● API Online';
      indicador.className = 'badge badge-online';
    } else {
      indicador.textContent = '● API Instável';
      indicador.className = 'badge badge-aviso';
    }
  } catch {
    indicador.textContent = '● API Offline';
    indicador.className = 'badge badge-offline';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Configura clique nas abas do menu
  document.querySelectorAll('.aba-btn').forEach((botao) => {
    botao.addEventListener('click', () => selecionarAba(botao.dataset.aba));
  });

  verificarStatusApi();
});
