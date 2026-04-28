function setMessage(elementId, text, type) {
  const element = document.getElementById(elementId);

  if (!element) {
    return;
  }

  element.textContent = text;
  element.className = `form-message ${type || ""}`.trim();
}

let cacheAgendaAdmin = [];

function formatarNota(nota) {
  const mapa = {
    "5 estrelas": "★★★★★",
    "4 estrelas": "★★★★☆",
    "3 estrelas": "★★★☆☆",
    "2 estrelas": "★★☆☆☆",
    "1 estrela": "★☆☆☆☆"
  };

  return mapa[nota] || nota || "★★★★★";
}

function montarLinkWhatsApp({ nome, data, hora, servico, pagamento }) {
  const telefone = "5583988736004";
  const observacaoPix = pagamento === "Pix"
    ? "%0AObservação: enviar chave Pix para confirmar o pagamento."
    : "";
  const mensagem =
    `Olá, vim pelo site da Girassol Bronzeamento Beleza.%0A` +
    `Quero confirmar este agendamento:%0A` +
    `Nome: ${nome}%0A` +
    `Serviço: ${servico}%0A` +
    `Data: ${data}%0A` +
    `Horário: ${hora}%0A` +
    `Pagamento: ${pagamento}${observacaoPix}`;

  return `https://wa.me/${telefone}?text=${mensagem}`;
}

function obterIdAgendamento(item) {
  return item._id || item.id;
}

function formatarMoeda(valor) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function obterValorServico(servico) {
  const precos = {
    "Bronze Natural": 80,
    "Bronze Gelado": 95,
    "Pacote com 3 Sessoes": 220,
    "Pacote Especial": 220
  };

  return precos[servico] || 0;
}

function normalizarServicoEdicao(servico) {
  if (servico === "Pacote Especial") {
    return "Pacote com 3 Sessoes";
  }

  return servico;
}

function salvarSessaoUsuario(user) {
  sessionStorage.setItem("girassol_user", JSON.stringify({
    nome: user.nome,
    email: user.email,
    tipo: user.tipo,
    token: user.token
  }));
}

function obterSessaoUsuario() {
  try {
    return JSON.parse(sessionStorage.getItem("girassol_user"));
  } catch (error) {
    return null;
  }
}

function protegerPainelAdmin() {
  const isAdminPage = Boolean(document.querySelector(".dashboard-page"));

  if (!isAdminPage) {
    return false;
  }

  const user = obterSessaoUsuario();

  if (!user || user.tipo !== "admin") {
    window.location = "login.html";
    return false;
  }

  return true;
}

function sair() {
  sessionStorage.removeItem("girassol_user");
  window.location = "login.html";
}

function authHeaders() {
  const user = obterSessaoUsuario();

  return user && user.token
    ? { Authorization: `Bearer ${user.token}` }
    : {};
}

async function fetchAdmin(url, options = {}) {
  const headers = {
    ...(options.headers || {}),
    ...authHeaders()
  };

  const res = await fetch(url, {
    ...options,
    headers
  });

  if (res.status === 401) {
    sair();
    return res;
  }

  return res;
}

async function login(event) {
  if (event) {
    event.preventDefault();
  }

  const email = document.getElementById("email").value.trim();
  const senha = document.getElementById("senha").value.trim();

  if (!email || !senha) {
    setMessage("loginMensagem", "Preencha e-mail e senha.", "error");
    return;
  }

  const res = await fetch("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha })
  });

  const user = await res.json();

  if (user.erro) {
    setMessage("loginMensagem", user.erro, "error");
    return;
  }

  salvarSessaoUsuario(user);
  setMessage("loginMensagem", "Login realizado com sucesso.", "success");
  window.location = user.tipo === "admin" ? "admin.html" : "cliente.html";
}

async function agendar(event) {
  if (event) {
    event.preventDefault();
  }

  const nome = document.getElementById("nome").value.trim();
  const data = document.getElementById("data").value;
  const hora = document.getElementById("hora").value;
  const servico = document.getElementById("servico").value;
  const pagamento = document.getElementById("pagamento").value;

  if (!nome || !data || !hora || !servico || !pagamento) {
    setMessage("agendamentoMensagem", "Preencha todos os campos para agendar.", "error");
    return;
  }

  const res = await fetch("/agendar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome, data, hora, servico, pagamento })
  });

  const retorno = await res.json();

  if (retorno.erro) {
    setMessage("agendamentoMensagem", retorno.erro, "error");
    return;
  }

  const linkWhatsApp = montarLinkWhatsApp({ nome, data, hora, servico, pagamento });
  document.getElementById("agendamentoForm").reset();
  setMessage("agendamentoMensagem", "Horário reservado com sucesso. O WhatsApp será aberto para confirmação.", "success");
  window.open(linkWhatsApp, "_blank");
}

async function avaliar(event) {
  if (event) {
    event.preventDefault();
  }

  const nome = document.getElementById("cliente").value.trim();
  const comentario = document.getElementById("comentario").value.trim();
  const nota = document.getElementById("nota").value;

  if (!nome || !comentario || !nota) {
    setMessage("avaliacaoMensagem", "Preencha todos os campos da avaliação.", "error");
    return;
  }

  const res = await fetch("/avaliacao", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome, comentario, nota })
  });

  const retorno = await res.json();

  if (retorno.erro) {
    setMessage("avaliacaoMensagem", retorno.erro, "error");
    return;
  }

  document.getElementById("avaliacaoForm").reset();
  setMessage("avaliacaoMensagem", "Avaliação enviada com sucesso.", "success");
}

async function carregarAgenda() {
  const div = document.getElementById("agenda");
  const filtroData = document.getElementById("filtroData");
  const filtroNome = document.getElementById("filtroNome");
  const filtroStatusPagamento = document.getElementById("filtroStatusPagamento");
  const filtroServico = document.getElementById("filtroServico");
  const resumoFiltros = document.getElementById("resumoFiltrosAgenda");
  const isAdmin = Boolean(document.getElementById("dashboardResumo"));

  if (!div) {
    return;
  }

  const res = await fetchAdmin("/agenda");
  const agenda = await res.json();

  if (Array.isArray(agenda)) {
    cacheAgendaAdmin = agenda;
  }

  if (!Array.isArray(agenda) || agenda.length === 0) {
    div.innerHTML = '<div class="empty-state">Nenhum agendamento encontrado no momento.</div>';
    cancelarEdicaoAgendamento();
    return;
  }

  const termoNome = filtroNome ? filtroNome.value.trim().toLowerCase() : "";
  const statusSelecionado = filtroStatusPagamento ? filtroStatusPagamento.value : "";
  const servicoSelecionado = filtroServico ? filtroServico.value : "";

  const agendaFiltrada = agenda
    .filter((item) => !filtroData || !filtroData.value || item.data === filtroData.value)
    .filter((item) => !termoNome || (item.nome || "").toLowerCase().includes(termoNome))
    .filter((item) => !statusSelecionado || (item.statusPagamento || "pendente") === statusSelecionado)
    .filter((item) => !servicoSelecionado || normalizarServicoEdicao(item.servico || "") === servicoSelecionado)
    .sort((a, b) => `${a.data} ${a.hora}`.localeCompare(`${b.data} ${b.hora}`));

  if (resumoFiltros) {
    const totalPrevisto = agendaFiltrada.reduce((soma, item) => soma + obterValorServico(normalizarServicoEdicao(item.servico)), 0);
    const totalRecebido = agendaFiltrada.reduce((soma, item) => {
      return soma + ((item.statusPagamento || "pendente") === "pago"
        ? obterValorServico(normalizarServicoEdicao(item.servico))
        : 0);
    }, 0);
    const totalPendente = totalPrevisto - totalRecebido;

    resumoFiltros.innerHTML = `
      <strong>${agendaFiltrada.length}</strong> agendamento(s) no filtro atual
      <span>Previsto: ${formatarMoeda(totalPrevisto)} | Recebido: ${formatarMoeda(totalRecebido)} | Pendente: ${formatarMoeda(totalPendente)}</span>
    `;
  }

  if (agendaFiltrada.length === 0) {
    div.innerHTML = '<div class="empty-state">Nenhum agendamento encontrado para esse filtro.</div>';
    return agenda;
  }

  div.innerHTML = agendaFiltrada
    .map((item) => `
      <article class="agenda-item">
        <div class="agenda-item-header">
          <strong>${item.nome}</strong>
          <span class="status-pill status-${item.statusPagamento || "pendente"}">${item.statusPagamento || "pendente"}</span>
        </div>
        <span>Serviço: ${item.servico}</span>
        <span>Data: ${item.data}</span>
        <span>Horário: ${item.hora}</span>
        <span>Pagamento: ${item.pagamento || "Não informado"}</span>
        ${isAdmin ? `
          <div class="agenda-actions">
            <button class="button button-primary button-small" type="button" data-action="edit" data-id="${obterIdAgendamento(item)}">
              Editar
            </button>
            <button class="button button-secondary button-small" type="button" data-action="status" data-id="${obterIdAgendamento(item)}" data-status="${item.statusPagamento === "pago" ? "pendente" : "pago"}">
              Marcar como ${item.statusPagamento === "pago" ? "pendente" : "pago"}
            </button>
            <button class="button button-danger button-small" type="button" data-action="delete" data-id="${obterIdAgendamento(item)}">
              Excluir
            </button>
          </div>
        ` : ""}
      </article>
    `)
    .join("");

  return agenda;
}

function preencherEditorAgendamento(item) {
  const editor = document.getElementById("editorAgendamento");

  if (!editor || !item) {
    return;
  }

  document.getElementById("editarAgendamentoId").value = obterIdAgendamento(item);
  document.getElementById("editarNome").value = item.nome || "";
  document.getElementById("editarServico").value = normalizarServicoEdicao(item.servico || "Bronze Natural");
  document.getElementById("editarData").value = item.data || "";
  document.getElementById("editarHora").value = item.hora || "";
  document.getElementById("editarPagamento").value = item.pagamento || "Pix";
  document.getElementById("editarStatusPagamento").value = item.statusPagamento || "pendente";
  editor.classList.remove("is-hidden");
  setMessage("editarAgendamentoMensagem", "", "");
  editor.scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelarEdicaoAgendamento() {
  const form = document.getElementById("editarAgendamentoForm");
  const editor = document.getElementById("editorAgendamento");

  if (!form || !editor) {
    return;
  }

  form.reset();
  document.getElementById("editarAgendamentoId").value = "";
  editor.classList.add("is-hidden");
  setMessage("editarAgendamentoMensagem", "", "");
}

async function salvarEdicaoAgendamento(event) {
  event.preventDefault();

  const id = document.getElementById("editarAgendamentoId").value;
  const nome = document.getElementById("editarNome").value.trim();
  const servico = document.getElementById("editarServico").value;
  const data = document.getElementById("editarData").value;
  const hora = document.getElementById("editarHora").value;
  const pagamento = document.getElementById("editarPagamento").value;
  const statusPagamento = document.getElementById("editarStatusPagamento").value;

  if (!id || !nome || !servico || !data || !hora || !pagamento || !statusPagamento) {
    setMessage("editarAgendamentoMensagem", "Preencha todos os campos da edição.", "error");
    return;
  }

  const res = await fetchAdmin(`/agenda/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome, servico, data, hora, pagamento, statusPagamento })
  });

  const retorno = await res.json();

  if (retorno.erro) {
    setMessage("editarAgendamentoMensagem", retorno.erro, "error");
    return;
  }

  setMessage("painelMensagem", "Agendamento atualizado com sucesso.", "success");
  cancelarEdicaoAgendamento();
  carregarAgenda();
  carregarPainelAdmin();
  carregarFinanceiro();
}

async function carregarAvaliacoes() {
  const div = document.getElementById("avaliacoesLista");

  if (!div) {
    return;
  }

  const res = await fetch("/avaliacoes");
  const avaliacoes = await res.json();

  if (!Array.isArray(avaliacoes) || avaliacoes.length === 0) {
    div.innerHTML = '<div class="empty-state">As avaliações enviadas pelas clientes aparecerão aqui.</div>';
    return;
  }

  div.innerHTML = avaliacoes
    .slice(0, 6)
    .map((avaliacao) => `
      <article class="testimonial-card">
        <span class="rating">${formatarNota(avaliacao.nota)}</span>
        <p>${avaliacao.comentario}</p>
        <strong>${avaliacao.nome}</strong>
      </article>
    `)
    .join("");

  return avaliacoes;
}

function calcularMediaAvaliacoes(avaliacoes) {
  const mapa = {
    "5 estrelas": 5,
    "4 estrelas": 4,
    "3 estrelas": 3,
    "2 estrelas": 2,
    "1 estrela": 1
  };

  if (!avaliacoes.length) {
    return "0.0";
  }

  const total = avaliacoes.reduce((soma, item) => soma + (mapa[item.nota] || 0), 0);
  return (total / avaliacoes.length).toFixed(1);
}

async function carregarPainelAdmin() {
  const resumo = document.getElementById("dashboardResumo");
  const destaques = document.getElementById("proximosHorarios");
  const avaliacoesAdmin = document.getElementById("avaliacoesAdmin");

  if (!resumo || !destaques || !avaliacoesAdmin) {
    return;
  }

  setMessage("painelMensagem", "Atualizando dados do painel...", "success");

  const [agendaRes, avaliacoesRes, statusRes] = await Promise.all([
    fetchAdmin("/agenda"),
    fetch("/avaliacoes"),
    fetchAdmin("/status")
  ]);

  const agenda = await agendaRes.json();
  const avaliacoes = await avaliacoesRes.json();
  const status = await statusRes.json();

  const agendaOrdenada = Array.isArray(agenda)
    ? [...agenda].sort((a, b) => `${a.data} ${a.hora}`.localeCompare(`${b.data} ${b.hora}`))
    : [];

  const proximos = agendaOrdenada.slice(0, 3);
  const media = calcularMediaAvaliacoes(Array.isArray(avaliacoes) ? avaliacoes : []);

  resumo.innerHTML = `
    <article class="metric-card">
      <strong>${agendaOrdenada.length}</strong>
      <span>agendamentos</span>
      <small>Total registrado no sistema</small>
    </article>
    <article class="metric-card">
      <strong>${Array.isArray(avaliacoes) ? avaliacoes.length : 0}</strong>
      <span>avaliações</span>
      <small>Comentários enviados pelas clientes</small>
    </article>
    <article class="metric-card">
      <strong>${media}</strong>
      <span>nota media</span>
      <small>Média calculada a partir das avaliações</small>
    </article>
    <article class="metric-card">
      <strong>${status.usandoMongo ? "MongoDB" : "Memória"}</strong>
      <span>modo atual</span>
      <small>${status.usandoMongo ? "Banco real conectado" : "Modo local para testes"}</small>
    </article>
  `;

  destaques.innerHTML = proximos.length
    ? `
      <h3>Próximos horários</h3>
      <ul>
        ${proximos.map((item) => `<li>${item.data} às ${item.hora} - ${item.nome} (${item.servico})</li>`).join("")}
      </ul>
    `
    : `
      <h3>Próximos horários</h3>
      <p>Nenhum horário agendado ainda.</p>
    `;

  avaliacoesAdmin.innerHTML = Array.isArray(avaliacoes) && avaliacoes.length
    ? avaliacoes.slice(0, 5).map((item) => `
      <article class="admin-review">
        <span class="rating">${formatarNota(item.nota)}</span>
        <p>${item.comentario}</p>
        <strong>${item.nome}</strong>
      </article>
    `).join("")
    : '<div class="empty-state">Nenhuma avaliação registrada ainda.</div>';

  setMessage("painelMensagem", "Painel atualizado com sucesso.", "success");
}

async function carregarFinanceiro() {
  const resumo = document.getElementById("financeiroResumo");
  const detalhes = document.getElementById("financeiroServicos");
  const filtroMes = document.getElementById("filtroMesFinanceiro");

  if (!resumo || !detalhes) {
    return;
  }

  const query = filtroMes && filtroMes.value ? `?mes=${filtroMes.value}` : "";
  const res = await fetchAdmin(`/admin/financeiro${query}`);
  const financeiro = await res.json();

  if (financeiro.erro) {
    setMessage("financeiroMensagem", financeiro.erro, "error");
    return;
  }

  resumo.innerHTML = `
    <article class="finance-card">
      <strong>${formatarMoeda(financeiro.totalRecebido)}</strong>
      <span>valor recebido</span>
      <small>Agendamentos marcados como pago</small>
    </article>
    <article class="finance-card">
      <strong>${formatarMoeda(financeiro.totalPendente)}</strong>
      <span>valor pendente</span>
      <small>Agendamentos ainda pendentes</small>
    </article>
    <article class="finance-card">
      <strong>${formatarMoeda(financeiro.totalPrevisto)}</strong>
      <span>total previsto</span>
      <small>Recebido + pendente no período</small>
    </article>
    <article class="finance-card">
      <strong>${financeiro.quantidadeAgendamentos}</strong>
      <span>agendamentos</span>
      <small>${financeiro.mes || "Todos os meses"}</small>
    </article>
  `;

  const servicos = Object.entries(financeiro.porServico || {});

  detalhes.innerHTML = servicos.length
    ? `
      <h3>Resumo por serviço</h3>
      <ul>
        ${servicos.map(([servico, dados]) => `
          <li>${servico}: ${dados.quantidade} agendamento(s), ${formatarMoeda(dados.total)}</li>
        `).join("")}
      </ul>
    `
    : `
      <h3>Resumo por serviço</h3>
      <p>Nenhum valor encontrado para esse período.</p>
    `;

  setMessage("financeiroMensagem", "Financeiro atualizado.", "success");
}

async function atualizarStatusAgendamento(id, statusPagamento) {
  const res = await fetchAdmin(`/agenda/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ statusPagamento })
  });

  const retorno = await res.json();

  if (retorno.erro) {
    setMessage("painelMensagem", retorno.erro, "error");
    return;
  }

  setMessage("painelMensagem", "Status do pagamento atualizado.", "success");
  carregarAgenda();
  carregarPainelAdmin();
  carregarFinanceiro();
}

async function excluirAgendamento(id) {
  const confirmar = window.confirm("Deseja excluir este agendamento?");

  if (!confirmar) {
    return;
  }

  const res = await fetchAdmin(`/agenda/${id}`, {
    method: "DELETE"
  });

  const retorno = await res.json();

  if (retorno.erro) {
    setMessage("painelMensagem", retorno.erro, "error");
    return;
  }

  setMessage("painelMensagem", "Agendamento excluído com sucesso.", "success");
  cancelarEdicaoAgendamento();
  carregarAgenda();
  carregarPainelAdmin();
  carregarFinanceiro();
}

async function carregarPerfilAdmin() {
  const form = document.getElementById("perfilAdminForm");

  if (!form) {
    return;
  }

  const res = await fetchAdmin("/admin/perfil");
  const perfil = await res.json();

  if (perfil.erro) {
    setMessage("perfilMensagem", perfil.erro, "error");
    return;
  }

  document.getElementById("adminNome").value = perfil.nome || "";
  document.getElementById("adminEmail").value = perfil.email || "";
}

async function salvarPerfilAdmin(event) {
  event.preventDefault();

  const nome = document.getElementById("adminNome").value.trim();
  const email = document.getElementById("adminEmail").value.trim();
  const senhaAtual = document.getElementById("adminSenhaAtual").value.trim();
  const novaSenha = document.getElementById("adminNovaSenha").value.trim();

  if (!nome || !email || !senhaAtual) {
    setMessage("perfilMensagem", "Preencha nome, e-mail e senha atual.", "error");
    return;
  }

  const res = await fetchAdmin("/admin/perfil", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome, email, senhaAtual, novaSenha })
  });

  const retorno = await res.json();

  if (retorno.erro) {
    setMessage("perfilMensagem", retorno.erro, "error");
    return;
  }

  document.getElementById("adminSenhaAtual").value = "";
  document.getElementById("adminNovaSenha").value = "";
  setMessage("perfilMensagem", "Perfil atualizado com sucesso.", "success");
  carregarPerfilAdmin();
}

document.addEventListener("DOMContentLoaded", () => {
  const painelLiberado = protegerPainelAdmin();
  const loginForm = document.getElementById("loginForm");
  const agendamentoForm = document.getElementById("agendamentoForm");
  const avaliacaoForm = document.getElementById("avaliacaoForm");
  const atualizarPainel = document.getElementById("atualizarPainel");
  const limparFiltro = document.getElementById("limparFiltro");
  const filtroData = document.getElementById("filtroData");
  const filtroNome = document.getElementById("filtroNome");
  const filtroStatusPagamento = document.getElementById("filtroStatusPagamento");
  const filtroServico = document.getElementById("filtroServico");
  const agendaDiv = document.getElementById("agenda");
  const perfilAdminForm = document.getElementById("perfilAdminForm");
  const editarAgendamentoForm = document.getElementById("editarAgendamentoForm");
  const cancelarEdicaoButton = document.getElementById("cancelarEdicaoAgendamento");
  const filtroMesFinanceiro = document.getElementById("filtroMesFinanceiro");
  const limparFiltroFinanceiro = document.getElementById("limparFiltroFinanceiro");
  const logoutButton = document.getElementById("logoutButton");

  if (loginForm) {
    loginForm.addEventListener("submit", login);
  }

  if (agendamentoForm) {
    agendamentoForm.addEventListener("submit", agendar);
  }

  if (avaliacaoForm) {
    avaliacaoForm.addEventListener("submit", avaliar);
  }

  if (atualizarPainel) {
    atualizarPainel.addEventListener("click", carregarPainelAdmin);
  }

  if (limparFiltro && filtroData) {
    limparFiltro.addEventListener("click", () => {
      filtroData.value = "";
      if (filtroNome) {
        filtroNome.value = "";
      }
      if (filtroStatusPagamento) {
        filtroStatusPagamento.value = "";
      }
      if (filtroServico) {
        filtroServico.value = "";
      }
      carregarAgenda();
    });
  }

  if (filtroData) {
    filtroData.addEventListener("change", carregarAgenda);
  }

  if (filtroNome) {
    filtroNome.addEventListener("input", carregarAgenda);
  }

  if (filtroStatusPagamento) {
    filtroStatusPagamento.addEventListener("change", carregarAgenda);
  }

  if (filtroServico) {
    filtroServico.addEventListener("change", carregarAgenda);
  }

  if (agendaDiv) {
    agendaDiv.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");

      if (!button) {
        return;
      }

      const { action, id, status } = button.dataset;

      if (action === "edit") {
        const item = cacheAgendaAdmin.find((agendamento) => obterIdAgendamento(agendamento) === id);
        preencherEditorAgendamento(item);
      }

      if (action === "status") {
        atualizarStatusAgendamento(id, status);
      }

      if (action === "delete") {
        excluirAgendamento(id);
      }
    });
  }

  if (perfilAdminForm) {
    perfilAdminForm.addEventListener("submit", salvarPerfilAdmin);
  }

  if (editarAgendamentoForm) {
    editarAgendamentoForm.addEventListener("submit", salvarEdicaoAgendamento);
  }

  if (cancelarEdicaoButton) {
    cancelarEdicaoButton.addEventListener("click", cancelarEdicaoAgendamento);
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", sair);
  }

  if (filtroMesFinanceiro) {
    filtroMesFinanceiro.addEventListener("change", carregarFinanceiro);
  }

  if (limparFiltroFinanceiro && filtroMesFinanceiro) {
    limparFiltroFinanceiro.addEventListener("click", () => {
      filtroMesFinanceiro.value = "";
      carregarFinanceiro();
    });
  }

  if (painelLiberado || !document.querySelector(".dashboard-page")) {
    carregarAgenda();
    carregarAvaliacoes();
    carregarPainelAdmin();
    carregarPerfilAdmin();
    carregarFinanceiro();
  }
});
