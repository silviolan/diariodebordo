'use strict';

const express = require('express');
const db = require('./db');
const auth = require('./auth');

const router = express.Router();

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const REGISTRATION_CODE = (process.env.REGISTRATION_CODE || '').trim();
const ALLOW_REGISTRATION =
  String(process.env.ALLOW_REGISTRATION == null ? 'true' : process.env.ALLOW_REGISTRATION)
    .trim()
    .toLowerCase() !== 'false';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Devolve só os campos públicos do usuário (nunca o hash da senha).
function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

// ── Configuração pública (o front usa para adaptar o formulário) ──────────────
router.get('/config', (_req, res) => {
  res.json({
    appName: 'Raíz Digital',
    allowRegistration: ALLOW_REGISTRATION,
    requireCode: Boolean(REGISTRATION_CODE),
  });
});

router.get('/health', (_req, res) => res.json({ ok: true }));

// ── Autenticação ──────────────────────────────────────────────────────────────
router.post('/auth/register', async (req, res) => {
  try {
    if (!ALLOW_REGISTRATION) {
      return res.status(403).json({ error: 'Os cadastros estão encerrados. Fale com o administrador.' });
    }

    const body = req.body || {};
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const code = String(body.code || '').trim();

    if (name.length < 2) return res.status(400).json({ error: 'Informe o seu nome.' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'E-mail inválido.' });
    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });
    }
    if (REGISTRATION_CODE && code !== REGISTRATION_CODE) {
      return res.status(403).json({ error: 'Código de convite incorreto.' });
    }

    const exists = await db.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (exists.rowCount) {
      return res.status(409).json({ error: 'Já existe uma conta com este e-mail.' });
    }

    const role = email && email === ADMIN_EMAIL ? 'admin' : 'member';
    const passwordHash = await auth.hashPassword(password);
    const { rows } = await db.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, email, passwordHash, role]
    );

    const user = rows[0];
    auth.setAuthCookie(res, auth.signToken(user));
    return res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    console.error('[register]', err);
    return res.status(500).json({ error: 'Não foi possível criar a conta. Tente novamente.' });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    const ok = user ? await auth.verifyPassword(password, user.password_hash) : false;
    if (!ok) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });

    auth.setAuthCookie(res, auth.signToken(user));
    return res.json({ user: publicUser(user) });
  } catch (err) {
    console.error('[login]', err);
    return res.status(500).json({ error: 'Não foi possível entrar. Tente novamente.' });
  }
});

router.post('/auth/logout', (_req, res) => {
  auth.clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/auth/me', auth.requireAuth, async (req, res) => {
  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.auth.id]);
  if (!rows[0]) {
    auth.clearAuthCookie(res);
    return res.status(401).json({ error: 'Sessão inválida.' });
  }
  res.json({ user: publicUser(rows[0]) });
});

// ── Tarefas (sempre no escopo do usuário logado) ─────────────────────────────
const TASK_ORDER = 'ORDER BY done ASC, due_date ASC NULLS LAST, created_at DESC';

router.get('/tasks', auth.requireAuth, async (req, res) => {
  const { rows } = await db.query(`SELECT * FROM tasks WHERE user_id = $1 ${TASK_ORDER}`, [req.auth.id]);
  res.json({ tasks: rows });
});

router.post('/tasks', auth.requireAuth, async (req, res) => {
  const body = req.body || {};
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim() || null;
  const dueDate = body.due_date ? String(body.due_date).slice(0, 10) : null;

  if (!title) return res.status(400).json({ error: 'Descreva a tarefa.' });
  if (title.length > 200) return res.status(400).json({ error: 'O título está muito longo.' });
  if (dueDate && !DATE_RE.test(dueDate)) return res.status(400).json({ error: 'Data inválida.' });

  const { rows } = await db.query(
    'INSERT INTO tasks (user_id, title, description, due_date) VALUES ($1, $2, $3, $4) RETURNING *',
    [req.auth.id, title, description, dueDate]
  );
  res.status(201).json({ task: rows[0] });
});

router.patch('/tasks/:id', auth.requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identificador inválido.' });

  const owned = await db.query('SELECT * FROM tasks WHERE id = $1 AND user_id = $2', [id, req.auth.id]);
  if (!owned.rowCount) return res.status(404).json({ error: 'Tarefa não encontrada.' });
  const current = owned.rows[0];

  const body = req.body || {};
  const next = {
    title: body.title !== undefined ? String(body.title).trim() : current.title,
    description:
      body.description !== undefined ? String(body.description).trim() || null : current.description,
    due_date:
      body.due_date !== undefined
        ? body.due_date
          ? String(body.due_date).slice(0, 10)
          : null
        : current.due_date,
    done: body.done !== undefined ? Boolean(body.done) : current.done,
  };

  if (!next.title) return res.status(400).json({ error: 'A tarefa precisa de um título.' });
  if (next.due_date && !DATE_RE.test(next.due_date)) return res.status(400).json({ error: 'Data inválida.' });

  // Registra/limpa o momento em que a tarefa foi concluída.
  let doneAt = current.done_at;
  if (next.done && !current.done) doneAt = new Date();
  if (!next.done && current.done) doneAt = null;

  const { rows } = await db.query(
    `UPDATE tasks
       SET title = $1, description = $2, due_date = $3, done = $4, done_at = $5, updated_at = now()
     WHERE id = $6
     RETURNING *`,
    [next.title, next.description, next.due_date, next.done, doneAt, id]
  );
  res.json({ task: rows[0] });
});

router.delete('/tasks/:id', auth.requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identificador inválido.' });

  const result = await db.query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [id, req.auth.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Tarefa não encontrada.' });
  res.json({ ok: true });
});

// ── Painel do administrador ──────────────────────────────────────────────────
router.get('/admin/users', auth.requireAuth, auth.requireAdmin, async (_req, res) => {
  const { rows } = await db.query(`
    SELECT u.id, u.name, u.email, u.role, u.created_at,
           COUNT(t.id)::int                          AS total,
           COUNT(t.id) FILTER (WHERE t.done)::int    AS concluidas,
           MAX(GREATEST(t.created_at, t.updated_at)) AS ultima_atividade
      FROM users u
      LEFT JOIN tasks t ON t.user_id = u.id
     GROUP BY u.id
     ORDER BY (u.role = 'admin') DESC, u.name ASC
  `);
  res.json({ users: rows });
});

router.get('/admin/users/:id/tasks', auth.requireAuth, auth.requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identificador inválido.' });

  const owner = await db.query('SELECT id, name, email, role FROM users WHERE id = $1', [id]);
  if (!owner.rowCount) return res.status(404).json({ error: 'Usuário não encontrado.' });

  const { rows } = await db.query(`SELECT * FROM tasks WHERE user_id = $1 ${TASK_ORDER}`, [id]);
  res.json({ user: owner.rows[0], tasks: rows });
});

module.exports = router;
