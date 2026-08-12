# Raíz Digital · Diário de bordo

Diário de tarefas colaborativo da equipe. Cada pessoa cria sua conta e registra
suas demandas em formato de _to-do list_, com data (prazo) e uma caixinha para
marcar o que já foi feito — guardando **quando** foi concluído. O administrador
enxerga o diário de todo mundo; cada membro vê apenas as próprias tarefas.

> Feito para rodar no **Render** a partir do seu repositório Git.

---

## ✨ O que ele faz

- **Login e cadastro** próprios (senha protegida com hash `bcrypt`).
- **Administrador** (você): vê a lista de todas as pessoas e o diário de cada uma.
- **Membros**: veem e gerenciam somente as suas tarefas.
- **Checklist com data**: título, detalhes, prazo e marcação de concluído (com carimbo de data/hora).
- **Atribuir tarefas** (admin): crie uma demanda e destine a um colega — ela aparece na lista dele marcada como _"Atribuída por você"_.
- **Cargo / função** (admin): defina a área de cada pessoa (ex.: Design, Back-end), visível no painel da Equipe.
- **Comentários nas tarefas**: o admin e o dono da tarefa conversam nos comentários de cada demanda.
- **Quadro de avisos**: o admin publica notícias, links e informações que **toda a equipe** vê.
  Pode **notificar por e-mail** (opcional — veja abaixo).
- **Filtros** (todas / pendentes / concluídas), barra de progresso e destaque de tarefas atrasadas.
- **Acesso por link**: o site é público, mas só entra quem tem conta — e você pode
  exigir um **código de convite** para liberar novos cadastros.
- Interface responsiva (funciona bem no celular) e com modo claro/escuro automático.

---

## 🧱 Tecnologia

- **Backend**: Node.js + Express
- **Banco**: PostgreSQL
- **Frontend**: HTML, CSS e JavaScript puro (sem frameworks pesados)
- Sessão via cookie `httpOnly` assinado com JWT

---

## 🚀 Publicar no Render (passo a passo)

### 1. Subir o código para o Git

Dentro da pasta do projeto:

```bash
git init
git add .
git commit -m "Raíz Digital - diário de bordo"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/raiz-digital.git
git push -u origin main
```

### 2. Criar o banco de dados (Neon — grátis e permanente)

O banco fica **fora do Render** de propósito (o Postgres grátis do Render só permite
1 banco por conta e expira depois de um tempo). Use o **Neon**, que é grátis e não expira:

1. Crie uma conta em [neon.tech](https://neon.tech) e um projeto novo.
2. Copie a **connection string** (algo como
   `postgresql://usuario:senha@ep-xxx.neon.tech/neondb?sslmode=require`). Guarde para o próximo passo.

### 3. Criar o site no Render (Blueprint)

O `render.yaml` cria o **site** e já configura tudo, menos o `DATABASE_URL` (que é o do Neon).

1. Acesse [dashboard.render.com](https://dashboard.render.com) e clique em **New + → Blueprint**.
2. Conecte o repositório que você subiu e clique em **Apply**.
3. Abra o serviço `raiz-digital` → aba **Environment** → defina a variável
   **`DATABASE_URL`** com a connection string do Neon e salve (isso dispara o deploy).
4. Ao final você recebe uma URL pública, por exemplo
   `https://raiz-digital.onrender.com` — **esse é o link que você compartilha com a equipe.**

> `JWT_SECRET` (gerada automaticamente) e `ADMIN_EMAIL` já vêm prontas do blueprint.
> As tabelas do banco são criadas sozinhas na primeira vez que o site sobe.

### 4. Virar administrador

Abra o site e clique em **Criar conta** usando o e-mail definido em `ADMIN_EMAIL`
(por padrão `silvio.neto@estudante.cear.ufpb.br`). Essa conta vira **administrador**
automaticamente e passa a ver a aba **Equipe**.

Para trocar o e-mail do admin, altere a variável `ADMIN_EMAIL` no painel do Render
(**Environment**) antes de se cadastrar.

---

## 🔐 Controlar quem pode entrar

Como o link é público, você pode restringir os cadastros de duas formas (no painel
do Render, em **Environment**):

| Variável             | Efeito                                                                 |
| -------------------- | --------------------------------------------------------------------- |
| `REGISTRATION_CODE`  | Se preenchida, todo cadastro exige esse código de convite.            |
| `ALLOW_REGISTRATION` | Coloque `false` para **fechar** novos cadastros quando o time já entrou. |

Depois de alterar uma variável, o Render reinicia o serviço sozinho.

---

## 📣 Avisos por e-mail (opcional)

O **quadro de avisos** funciona sozinho. Se você quiser que, ao publicar um aviso,
a equipe também receba um **e-mail**, basta configurar um serviço de envio no Render
(**Environment**). Sem essas variáveis, a opção de e-mail simplesmente não aparece.

| Variável    | O que colocar                                                        |
| ----------- | ------------------------------------------------------------------- |
| `SMTP_HOST` | Servidor SMTP (ex.: `smtp-relay.brevo.com` ou `smtp.gmail.com`)      |
| `SMTP_PORT` | `587` (padrão) ou `465`                                             |
| `SMTP_USER` | Usuário/login do serviço                                            |
| `SMTP_PASS` | Senha do serviço (no Gmail, use uma **"Senha de app"**)             |
| `SMTP_FROM` | E-mail que aparece como remetente                                   |
| `APP_URL`   | (opcional) endereço do site, incluído no rodapé do e-mail           |

**Sugestões grátis:** [Brevo](https://www.brevo.com) (300 e-mails/dia, sem precisar de
domínio) ou Gmail com "Senha de app". Obs.: e-mails de serviços gratuitos podem cair no
spam no começo — peça à equipe para marcar como "não é spam".

---

## 💻 Rodar na sua máquina (opcional)

Você precisa de Node.js 18+ e um PostgreSQL (local ou na nuvem).

```bash
npm install
cp .env.example .env      # no Windows (PowerShell): copy .env.example .env
# edite o .env e preencha DATABASE_URL e JWT_SECRET
npm run dev
```

Acesse `http://localhost:3000`.

> Sem PostgreSQL instalado? Crie um banco grátis em [neon.tech](https://neon.tech)
> ou [supabase.com](https://supabase.com) e cole a string de conexão em `DATABASE_URL`.

---

## ⚠️ Por que o banco fica no Neon (e não no Render)

O PostgreSQL grátis do Render tem duas limitações: **só 1 banco grátis por conta** e ele
**expira depois de um tempo**. Por isso o projeto usa um banco no **Neon** (grátis, permanente
e independente do site) — assim seus dados ficam salvos a longo prazo e você pode migrar o
site para outro host sem perder nada.

Precisou trocar de banco? É só apontar a variável `DATABASE_URL` para o novo PostgreSQL
(Neon, Supabase, Railway, etc.). Para levar os dados junto, exporte com
`pg_dump "URL_ANTIGA" > backup.sql` e importe com `psql "URL_NOVA" < backup.sql`.

---

## 📁 Estrutura do projeto

```
.
├── server.js          # inicializa o servidor Express
├── db.js              # conexão e tabelas (usuários, tarefas, comentários, avisos)
├── auth.js            # senhas, tokens e proteção das rotas
├── api.js             # rotas da API (login, tarefas, avisos, admin)
├── mailer.js          # envio de e-mail opcional (avisos)
├── render.yaml        # blueprint do Render (cria o site)
├── .env.example       # modelo das variáveis de ambiente
└── public/
    ├── index.html     # estrutura da página
    ├── styles.css     # visual (paleta terrosa, claro/escuro)
    └── app.js         # lógica da interface
```
