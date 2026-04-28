# Publicação no Render

Este projeto já está preparado para deploy no Render com os arquivos `render.yaml` e `.node-version`.

## O que você vai precisar

- Conta no GitHub
- Conta no Render
- Repositório com este projeto enviado para o GitHub
- MongoDB Atlas já criado

## Variáveis de ambiente

Configure estas variáveis no Render:

- `MONGODB_URI`
- `ADMIN_EMAIL`
- `ADMIN_SENHA`

Exemplo:

```env
MONGODB_URI=mongodb+srv://usuario:senha@cluster.mongodb.net/girassol?retryWrites=true&w=majority
ADMIN_EMAIL=admin@bronze.com
ADMIN_SENHA=123456
```

## Passo a passo

1. Envie este projeto para um repositório no GitHub.
2. Entre no Render e clique em `New +`.
3. Escolha `Blueprint`.
4. Conecte o repositório que contém este projeto.
5. O Render vai ler o arquivo `render.yaml`.
6. Preencha `MONGODB_URI`, `ADMIN_EMAIL` e `ADMIN_SENHA`.
7. Clique para criar o serviço.
8. Aguarde o deploy terminar.

## URL do site

Depois do deploy, o Render vai gerar uma URL parecida com:

```txt
https://girassol-bronzeamento-beleza.onrender.com
```

## Observações

- O serviço foi configurado como `web service` em Node.js.
- O comando de build é `npm install`.
- O comando de start é `npm start`.
- O health check usa `/`.
- O admin continua acessando por `/login.html`.

## Links úteis

- Site principal: `/`
- Login admin: `/login.html`
- Painel admin: `/admin.html`
