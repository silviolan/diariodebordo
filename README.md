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
- **Filtros** (todas / pendentes / concluídas), barra de progresso e destaque de tarefas atrasadas.
- **Acesso por link**: o site é público, mas só entra quem tem conta — e você pode
  exigir um **código de convite** para liberar novos cadastros.
- Interface responsável (funciona bem no celular) e com modo claro/escuro automático.

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

### 2. Criar o serviço no Render (jeito fácil — Blueprint)

Este projeto já vem com um arquivo `render.yaml` que cria **o site e o banco de dados juntos**.

1. Acesse [dashboard.render.com](https://dashboard.render.com) e clique em **New + → Blueprint**.
2. Conecte o repositório que você acabou de subir.
3. O Render lê o `render.yaml` e mostra o site (`raiz-digital`) + o banco (`raiz-digital-db`). Clique em **Apply**.
4. Aguarde o build. Ao final, você recebe uma URL pública, por exemplo:
   `https://raiz-digital.onrender.com` — **esse é o link que você compartilha com a equipe.**

> As variáveis `JWT_SECRET` (gerada automaticamente), `ADMIN_EMAIL` e `DATABASE_URL`
> já são configuradas pelo blueprint. As tabelas do banco são criadas sozinhas na
> primeira vez que o site sobe.

### 3. Virar administrador

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

## ⚠️ Sobre o banco grátis do Render

O plano gratuito de PostgreSQL do Render **pode expirar depois de um período**.
Para um banco gratuito e permanente, crie um no **Neon** (neon.tech), copie a
_connection string_ e cole na variável `DATABASE_URL` do site no Render — o app
funciona igual, sem mudar nenhuma linha de código.

---

## 📁 Estrutura do projeto

```
.
├── server.js          # inicializa o servidor Express
├── db.js              # conexão e criação das tabelas
├── auth.js            # senhas, tokens e proteção das rotas
├── api.js             # rotas da API (login, tarefas, admin)
├── render.yaml        # blueprint do Render (site + banco)
├── .env.example       # modelo das variáveis de ambiente
└── public/
    ├── index.html     # estrutura da página
    ├── styles.css     # visual (paleta terrosa, claro/escuro)
    └── app.js         # lógica da interface
```
