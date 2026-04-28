require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const crypto = require("crypto");
const { promisify } = require("util");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@bronze.com";
const ADMIN_SENHA = process.env.ADMIN_SENHA || "123456";
const STATUS_PAGAMENTO_PERMITIDOS = ["pendente", "pago"];
const FORMAS_PAGAMENTO_PERMITIDAS = ["Pix", "Dinheiro", "Cartao"];
const PRECOS_SERVICOS = {
  "Bronze Natural": 80,
  "Bronze Gelado": 95,
  "Pacote com 3 Sessoes": 220,
  "Pacote Especial": 220
};
const scryptAsync = promisify(crypto.scrypt);

app.use(express.json());
app.use(cors());
app.use(express.static("public"));

const Usuario = require("./models/Usuario");
const Agendamento = require("./models/Agendamento");
const Avaliacao = require("./models/Avaliacao");

let usandoMongo = false;
const sessoesAdmin = new Map();

const memoria = {
  ultimoIdAgendamento: 0,
  usuarios: [
    {
      nome: "Administrador",
      email: ADMIN_EMAIL,
      senha: ADMIN_SENHA,
      tipo: "admin"
    },
    {
      nome: "Cliente Demo",
      email: "cliente@bronze.com",
      senha: "123456",
      tipo: "cliente"
    }
  ],
  agendamentos: [],
  avaliacoes: [
    {
      nome: "Camila",
      comentario: "Atendimento super cuidadoso, ambiente bonito e resultado muito elegante.",
      nota: "5 estrelas"
    },
    {
      nome: "Fernanda",
      comentario: "Agendamento fácil, sessão confortável e acabamento uniforme.",
      nota: "5 estrelas"
    },
    {
      nome: "Juliana",
      comentario: "Experiência ótima do começo ao fim. Voltarei com certeza.",
      nota: "4 estrelas"
    }
  ]
};

async function prepararUsuariosMemoria() {
  for (const usuario of memoria.usuarios) {
    if (!senhaEstaComHash(usuario.senha)) {
      usuario.senha = await gerarHashSenha(usuario.senha);
    }
  }
}

async function conectarMongo() {
  if (!MONGODB_URI) {
    console.log("MONGODB_URI não configurada. Iniciando em modo local com memória.");
    return;
  }

  try {
    await mongoose.connect(MONGODB_URI);
    usandoMongo = true;
    console.log("MongoDB conectado");
    await criarAdmin();
  } catch (error) {
    console.log("Falha ao conectar no MongoDB. Continuando em modo memória.", error.message);
  }
}

async function criarAdmin() {
  if (!usandoMongo) {
    return;
  }

  try {
    const admin = await Usuario.findOne({ email: ADMIN_EMAIL });

    if (!admin) {
      await Usuario.create({
        nome: "Administrador",
        email: ADMIN_EMAIL,
        senha: await gerarHashSenha(ADMIN_SENHA),
        tipo: "admin"
      });

      console.log("Admin criado com sucesso");
    } else {
      if (!senhaEstaComHash(admin.senha)) {
        admin.senha = await gerarHashSenha(admin.senha);
        await admin.save();
        console.log("Senha do admin migrada para hash");
      }

      console.log("Admin já existe");
    }
  } catch (error) {
    console.log("Erro ao criar admin", error.message);
  }
}

function validarTexto(valor) {
  return typeof valor === "string" && valor.trim().length > 0;
}

function senhaEstaComHash(senha) {
  return typeof senha === "string" && senha.startsWith("scrypt$");
}

async function gerarHashSenha(senha) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scryptAsync(senha, salt, 64);

  return `scrypt$${salt}$${hash.toString("hex")}`;
}

async function validarSenha(senha, senhaSalva) {
  if (!senhaEstaComHash(senhaSalva)) {
    return senha === senhaSalva;
  }

  const [, salt, hashSalvo] = senhaSalva.split("$");
  const hashInformado = await scryptAsync(senha, salt, 64);
  const hashSalvoBuffer = Buffer.from(hashSalvo, "hex");

  return crypto.timingSafeEqual(hashInformado, hashSalvoBuffer);
}

function criarIdAgendamento() {
  memoria.ultimoIdAgendamento += 1;
  return String(memoria.ultimoIdAgendamento);
}

function removerSenha(usuario) {
  if (!usuario) {
    return null;
  }

  return {
    id: usuario._id || usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    tipo: usuario.tipo
  };
}

function criarTokenAdmin(usuario) {
  const token = crypto.randomBytes(32).toString("hex");

  sessoesAdmin.set(token, {
    email: usuario.email,
    tipo: usuario.tipo,
    criadoEm: Date.now()
  });

  return token;
}

function exigirAdmin(req, res, next) {
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.replace("Bearer ", "")
    : "";
  const sessao = sessoesAdmin.get(token);

  if (!sessao || sessao.tipo !== "admin") {
    return res.status(401).json({ erro: "Acesso administrativo não autorizado." });
  }

  req.admin = sessao;
  next();
}

async function buscarAdmin() {
  if (usandoMongo) {
    return Usuario.findOne({ tipo: "admin" });
  }

  return memoria.usuarios.find((item) => item.tipo === "admin");
}

function obterValorServico(servico) {
  return PRECOS_SERVICOS[servico] || 0;
}

function validarStatusPagamento(statusPagamento) {
  return STATUS_PAGAMENTO_PERMITIDOS.includes(statusPagamento);
}

function validarPagamento(pagamento) {
  return FORMAS_PAGAMENTO_PERMITIDAS.includes(pagamento);
}

async function horarioOcupado({ data, hora, ignorarId }) {
  if (usandoMongo) {
    const ocupado = await Agendamento.findOne({ data, hora }).lean();

    if (!ocupado) {
      return false;
    }

    return String(ocupado._id) !== String(ignorarId);
  }

  const ocupado = memoria.agendamentos.find((item) => item.data === data && item.hora === hora);

  if (!ocupado) {
    return false;
  }

  return String(ocupado.id) !== String(ignorarId);
}

function criarResumoFinanceiro(agendamentos, mes) {
  const filtrados = agendamentos.filter((item) => {
    if (!mes) {
      return true;
    }

    return typeof item.data === "string" && item.data.startsWith(mes);
  });

  return filtrados.reduce((resumo, item) => {
    const valor = obterValorServico(item.servico);

    resumo.totalPrevisto += valor;
    resumo.quantidadeAgendamentos += 1;

    if (item.statusPagamento === "pago") {
      resumo.totalRecebido += valor;
    } else {
      resumo.totalPendente += valor;
    }

    if (!resumo.porServico[item.servico]) {
      resumo.porServico[item.servico] = {
        quantidade: 0,
        total: 0
      };
    }

    resumo.porServico[item.servico].quantidade += 1;
    resumo.porServico[item.servico].total += valor;

    return resumo;
  }, {
    mes: mes || null,
    totalRecebido: 0,
    totalPendente: 0,
    totalPrevisto: 0,
    quantidadeAgendamentos: 0,
    porServico: {}
  });
}

app.post("/login", async (req, res) => {
  const { email, senha } = req.body;

  if (!validarTexto(email) || !validarTexto(senha)) {
    return res.status(400).json({ erro: "Informe e-mail e senha." });
  }

  try {
    let user;

    if (usandoMongo) {
      user = await Usuario.findOne({ email });
    } else {
      user = memoria.usuarios.find((item) => item.email === email);
    }

    if (!user || !(await validarSenha(senha, user.senha))) {
      return res.status(401).json({ erro: "Usuário ou senha inválidos." });
    }

    const resposta = removerSenha(user);

    if (user.tipo === "admin") {
      resposta.token = criarTokenAdmin(user);
    }

    res.json(resposta);
  } catch (error) {
    res.status(500).json({ erro: "Erro no login." });
  }
});

app.post("/cadastro", async (req, res) => {
  const { nome, email, senha, tipo } = req.body;

  if (!validarTexto(nome) || !validarTexto(email) || !validarTexto(senha)) {
    return res.status(400).json({ erro: "Preencha nome, e-mail e senha." });
  }

  try {
    if (usandoMongo) {
      const usuario = new Usuario({ nome, email, senha: await gerarHashSenha(senha), tipo: tipo || "cliente" });
      await usuario.save();
      return res.json(usuario);
    }

    const usuario = { nome, email, senha: await gerarHashSenha(senha), tipo: tipo || "cliente" };
    memoria.usuarios.push(usuario);
    res.json(usuario);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao cadastrar." });
  }
});

app.get("/admin/perfil", exigirAdmin, async (req, res) => {
  try {
    const admin = await buscarAdmin();

    if (!admin) {
      return res.status(404).json({ erro: "Administrador não encontrado." });
    }

    res.json(removerSenha(admin));
  } catch (error) {
    res.status(500).json({ erro: "Erro ao carregar perfil." });
  }
});

app.patch("/admin/perfil", exigirAdmin, async (req, res) => {
  const { nome, email, senhaAtual, novaSenha } = req.body;

  if (!validarTexto(nome) || !validarTexto(email) || !validarTexto(senhaAtual)) {
    return res.status(400).json({ erro: "Preencha nome, e-mail e senha atual." });
  }

  try {
    const admin = await buscarAdmin();

    if (!admin) {
      return res.status(404).json({ erro: "Administrador não encontrado." });
    }

    if (!(await validarSenha(senhaAtual, admin.senha))) {
      return res.status(401).json({ erro: "Senha atual incorreta." });
    }

    const senhaFinal = validarTexto(novaSenha) ? await gerarHashSenha(novaSenha) : admin.senha;

    if (usandoMongo) {
      admin.nome = nome;
      admin.email = email;
      admin.senha = senhaFinal;
      await admin.save();
      return res.json(removerSenha(admin));
    }

    admin.nome = nome;
    admin.email = email;
    admin.senha = senhaFinal;
    res.json(removerSenha(admin));
  } catch (error) {
    res.status(500).json({ erro: "Erro ao atualizar perfil." });
  }
});

app.get("/admin/financeiro", exigirAdmin, async (req, res) => {
  const { mes } = req.query;

  if (mes && !/^\d{4}-\d{2}$/.test(mes)) {
    return res.status(400).json({ erro: "Informe o mês no formato AAAA-MM." });
  }

  try {
    const agendamentos = usandoMongo
      ? await Agendamento.find().lean()
      : memoria.agendamentos;

    res.json(criarResumoFinanceiro(agendamentos, mes));
  } catch (error) {
    res.status(500).json({ erro: "Erro ao carregar financeiro." });
  }
});

app.post("/agendar", async (req, res) => {
  const { nome, data, hora, servico, pagamento } = req.body;

  if (!validarTexto(nome) || !validarTexto(data) || !validarTexto(hora) || !validarTexto(servico) || !validarTexto(pagamento)) {
    return res.status(400).json({ erro: "Preencha nome, data, horário, serviço e pagamento." });
  }

  if (!validarPagamento(pagamento)) {
    return res.status(400).json({ erro: "Forma de pagamento inválida." });
  }

  try {
    if (await horarioOcupado({ data, hora })) {
      return res.status(409).json({ erro: "Esse horário já está reservado. Escolha outro horário." });
    }

    if (usandoMongo) {
      const novo = new Agendamento({ nome, data, hora, servico, pagamento, statusPagamento: "pendente" });
      await novo.save();
      return res.json(novo);
    }

    const novo = { id: criarIdAgendamento(), nome, data, hora, servico, pagamento, statusPagamento: "pendente" };
    memoria.agendamentos.push(novo);
    res.json(novo);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao registrar agendamento." });
  }
});

app.get("/agenda", exigirAdmin, async (req, res) => {
  try {
    if (usandoMongo) {
      const agenda = await Agendamento.find().lean();
      return res.json(agenda);
    }

    res.json(memoria.agendamentos);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao carregar agenda." });
  }
});

app.patch("/agenda/:id/status", exigirAdmin, async (req, res) => {
  const { id } = req.params;
  const { statusPagamento } = req.body;

  if (!validarStatusPagamento(statusPagamento)) {
    return res.status(400).json({ erro: "Status de pagamento inválido." });
  }

  try {
    if (usandoMongo) {
      const agendamento = await Agendamento.findByIdAndUpdate(
        id,
        { statusPagamento },
        { new: true }
      );

      if (!agendamento) {
        return res.status(404).json({ erro: "Agendamento não encontrado." });
      }

      return res.json(agendamento);
    }

    const agendamento = memoria.agendamentos.find((item) => item.id === id);

    if (!agendamento) {
      return res.status(404).json({ erro: "Agendamento não encontrado." });
    }

    agendamento.statusPagamento = statusPagamento;
    res.json(agendamento);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao atualizar pagamento." });
  }
});

app.patch("/agenda/:id", exigirAdmin, async (req, res) => {
  const { id } = req.params;
  const { nome, data, hora, servico, pagamento, statusPagamento } = req.body;

  if (!validarTexto(nome) || !validarTexto(data) || !validarTexto(hora) || !validarTexto(servico) || !validarTexto(pagamento)) {
    return res.status(400).json({ erro: "Preencha nome, data, horário, serviço e pagamento." });
  }

  if (!validarPagamento(pagamento)) {
    return res.status(400).json({ erro: "Forma de pagamento inválida." });
  }

  if (!validarStatusPagamento(statusPagamento)) {
    return res.status(400).json({ erro: "Status de pagamento inválido." });
  }

  try {
    if (await horarioOcupado({ data, hora, ignorarId: id })) {
      return res.status(409).json({ erro: "Esse horário já está reservado. Escolha outro horário." });
    }

    if (usandoMongo) {
      const agendamento = await Agendamento.findByIdAndUpdate(
        id,
        { nome, data, hora, servico, pagamento, statusPagamento },
        { new: true }
      );

      if (!agendamento) {
        return res.status(404).json({ erro: "Agendamento não encontrado." });
      }

      return res.json(agendamento);
    }

    const agendamento = memoria.agendamentos.find((item) => item.id === id);

    if (!agendamento) {
      return res.status(404).json({ erro: "Agendamento não encontrado." });
    }

    agendamento.nome = nome;
    agendamento.data = data;
    agendamento.hora = hora;
    agendamento.servico = servico;
    agendamento.pagamento = pagamento;
    agendamento.statusPagamento = statusPagamento;

    res.json(agendamento);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao atualizar agendamento." });
  }
});

app.delete("/agenda/:id", exigirAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    if (usandoMongo) {
      const agendamento = await Agendamento.findByIdAndDelete(id);

      if (!agendamento) {
        return res.status(404).json({ erro: "Agendamento não encontrado." });
      }

      return res.json({ ok: true });
    }

    const indice = memoria.agendamentos.findIndex((item) => item.id === id);

    if (indice === -1) {
      return res.status(404).json({ erro: "Agendamento não encontrado." });
    }

    memoria.agendamentos.splice(indice, 1);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ erro: "Erro ao excluir agendamento." });
  }
});

app.post("/avaliacao", async (req, res) => {
  const { nome, comentario, nota } = req.body;

  if (!validarTexto(nome) || !validarTexto(comentario) || !validarTexto(nota)) {
    return res.status(400).json({ erro: "Preencha nome, comentário e nota." });
  }

  try {
    if (usandoMongo) {
      const avaliacao = new Avaliacao({ nome, comentario, nota });
      await avaliacao.save();
      return res.json(avaliacao);
    }

    const avaliacao = { nome, comentario, nota };
    memoria.avaliacoes.unshift(avaliacao);
    res.json(avaliacao);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao salvar avaliação." });
  }
});

app.get("/avaliacoes", async (req, res) => {
  try {
    if (usandoMongo) {
      const lista = await Avaliacao.find().sort({ _id: -1 }).lean();
      return res.json(lista);
    }

    res.json(memoria.avaliacoes);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao carregar avaliações." });
  }
});

app.get("/status", exigirAdmin, async (req, res) => {
  try {
    const totalAgendamentos = usandoMongo
      ? await Agendamento.countDocuments()
      : memoria.agendamentos.length;

    const totalAvaliacoes = usandoMongo
      ? await Avaliacao.countDocuments()
      : memoria.avaliacoes.length;

    res.json({
      usandoMongo,
      totalAgendamentos,
      totalAvaliacoes
    });
  } catch (error) {
    res.status(500).json({ erro: "Erro ao carregar status." });
  }
});

prepararUsuariosMemoria().then(conectarMongo).finally(() => {
  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
});
