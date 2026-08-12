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

// SELECT reutilizável: traz o nome de quem atribuiu e a contagem de comentários.
const TASK_SELECT = `
  SELECT t.*,
         a.name AS assigned_by_name,
         (SELECT COUNT(*) FROM comments c WHERE c.task_id = t.id)::int AS comment_count
    FROM tasks t
    LEFT JOIN users a ON a.id = t.assigned_by`;
const TASK_ORDER = 'ORDER BY t.done ASC, t.due_date ASC NULLS LAST, t.created_at DESC';

// Devolve só os campos públicos do usuário (nunca o hash da senha).
function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email, role: row.role, cargo: row.cargo || null };
}

function parseTaskBody(body, current) {
  const out = {};
  if (body.title !== undefined) out.title = String(body.title).trim();
  else if (current) out.title = current.title;

  if (body.description !== undefined) out.description = String(body.description).trim() || null;
  else if (current) out.description = current.description;

  if (body.due_date !== undefined) out.due_date = body.due_date ? String(body.due_date).slice(0, 10) : null;
  else if (current) out.due_date = current.due_date;

  return out;
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

// ── Tarefas ───────────────────────────────────────────────────────────────────
router.get('/tasks', auth.requireAuth, async (req, res) => {
  const { rows } = await db.query(`${TASK_SELECT} WHERE t.user_id = $1 ${TASK_ORDER}`, [req.auth.id]);
  res.json({ tasks: rows });
});

router.post('/tasks', auth.requireAuth, async (req, res) => {
  const t = parseTaskBody(req.body || {});
  if (!t.title) return res.status(400).json({ error: 'Descreva a tarefa.' });
  if (t.title.length > 200) return res.status(400).json({ error: 'O título está muito longo.' });
  if (t.due_date && !DATE_RE.test(t.due_date)) return res.status(400).json({ error: 'Data inválida.' });

  const ins = await db.query(
    'INSERT INTO tasks (user_id, title, description, due_date) VALUES ($1, $2, $3, $4) RETURNING id',
    [req.auth.id, t.title, t.description, t.due_date]
  );
  const { rows } = await db.query(`${TASK_SELECT} WHERE t.id = $1`, [ins.rows[0].id]);
  res.status(201).json({ task: rows[0] });
});

router.patch('/tasks/:id', auth.requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identificador inválido.' });

  const found = await db.query('SELECT * FROM tasks WHERE id = $1', [id]);
  if (!found.rowCount) return res.status(404).json({ error: 'Tarefa não encontrada.' });
  const current = found.rows[0];

  const isOwner = current.user_id === req.auth.id;
  const isAdmin = req.auth.role === 'admin';
  if (!isOwner && !isAdmin) return res.status(404).json({ error: 'Tarefa não encontrada.' });

  const body = req.body || {};
  const t = parseTaskBody(body, current);
  const done = body.done !== undefined ? Boolean(body.done) : current.done;

  if (!t.title) return res.status(400).json({ error: 'A tarefa precisa de um título.' });
  if (t.due_date && !DATE_RE.test(t.due_date)) return res.status(400).json({ error: 'Data inválida.' });

  // Registra/limpa o momento em que a tarefa foi concluída.
  let doneAt = current.done_at;
  if (done && !current.done) doneAt = new Date();
  if (!done && current.done) doneAt = null;

  await db.query(
    `UPDATE tasks
        SET title = $1, description = $2, due_date = $3, done = $4, done_at = $5, updated_at = now()
      WHERE id = $6`,
    [t.title, t.description, t.due_date, done, doneAt, id]
  );
  const { rows } = await db.query(`${TASK_SELECT} WHERE t.id = $1`, [id]);
  res.json({ task: rows[0] });
});

router.delete('/tasks/:id', auth.requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identificador inválido.' });

  const found = await db.query('SELECT user_id FROM tasks WHERE id = $1', [id]);
  if (!found.rowCount) return res.status(404).json({ error: 'Tarefa não encontrada.' });

  const isOwner = found.rows[0].user_id === req.auth.id;
  const isAdmin = req.auth.role === 'admin';
  if (!isOwner && !isAdmin) return res.status(404).json({ error: 'Tarefa não encontrada.' });

  await db.query('DELETE FROM tasks WHERE id = $1', [id]);
  res.json({ ok: true });
});

// ── Comentários (dono da tarefa ou admin) ─────────────────────────────────────
async function accessibleTask(taskId, authCtx) {
  const r = await db.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
  if (!r.rowCount) return { status: 404 };
  const task = r.rows[0];
  if (task.user_id !== authCtx.id && authCtx.role !== 'admin') return { status: 403 };
  return { task };
}

const COMMENT_SELECT = `
  SELECT c.id, c.body, c.created_at, c.author_id, u.name AS author_name, u.role AS author_role
    FROM comments c JOIN users u ON u.id = c.author_id`;

router.get('/tasks/:id/comments', auth.requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identificador inválido.' });

  const acc = await accessibleTask(id, req.auth);
  if (acc.status === 404) return res.status(404).json({ error: 'Tarefa não encontrada.' });
  if (acc.status === 403) return res.status(403).json({ error: 'Sem acesso a esta tarefa.' });

  const { rows } = await db.query(`${COMMENT_SELECT} WHERE c.task_id = $1 ORDER BY c.created_at ASC`, [id]);
  res.json({ comments: rows });
});

router.post('/tasks/:id/comments', auth.requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identificador inválido.' });

  const acc = await accessibleTask(id, req.auth);
  if (acc.status === 404) return res.status(404).json({ error: 'Tarefa não encontrada.' });
  if (acc.status === 403) return res.status(403).json({ error: 'Sem acesso a esta tarefa.' });

  const commentBody = String((req.body || {}).body || '').trim();
  if (!commentBody) return res.status(400).json({ error: 'Escreva um comentário.' });
  if (commentBody.length > 1000) return res.status(400).json({ error: 'Comentário muito longo.' });

  const ins = await db.query(
    'INSERT INTO comments (task_id, author_id, body) VALUES ($1, $2, $3) RETURNING id',
    [id, req.auth.id, commentBody]
  );
  const { rows } = await db.query(`${COMMENT_SELECT} WHERE c.id = $1`, [ins.rows[0].id]);
  res.status(201).json({ comment: rows[0] });
});

router.delete('/comments/:id', auth.requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identificador inválido.' });

  const found = await db.query('SELECT author_id FROM comments WHERE id = $1', [id]);
  if (!found.rowCount) return res.status(404).json({ error: 'Comentário não encontrado.' });
  if (found.rows[0].author_id !== req.auth.id && req.auth.role !== 'admin') {
    return res.status(403).json({ error: 'Você não pode excluir este comentário.' });
  }
  await db.query('DELETE FROM comments WHERE id = $1', [id]);
  res.json({ ok: true });
});

// ── Painel do administrador ──────────────────────────────────────────────────
router.get('/admin/users', auth.requireAuth, auth.requireAdmin, async (_req, res) => {
  const { rows } = await db.query(`
    SELECT u.id, u.name, u.email, u.role, u.cargo, u.created_at,
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

  const owner = await db.query('SELECT id, name, email, role, cargo FROM users WHERE id = $1', [id]);
  if (!owner.rowCount) return res.status(404).json({ error: 'Usuário não encontrado.' });

  const { rows } = await db.query(`${TASK_SELECT} WHERE t.user_id = $1 ${TASK_ORDER}`, [id]);
  res.json({ user: publicUser(owner.rows[0]), tasks: rows });
});

// Admin atribui uma tarefa a um usuário.
router.post('/admin/users/:id/tasks', auth.requireAuth, auth.requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identificador inválido.' });

  const owner = await db.query('SELECT id FROM users WHERE id = $1', [id]);
  if (!owner.rowCount) return res.status(404).json({ error: 'Usuário não encontrado.' });

  const t = parseTaskBody(req.body || {});
  if (!t.title) return res.status(400).json({ error: 'Descreva a tarefa a atribuir.' });
  if (t.title.length > 200) return res.status(400).json({ error: 'O título está muito longo.' });
  if (t.due_date && !DATE_RE.test(t.due_date)) return res.status(400).json({ error: 'Data inválida.' });

  const ins = await db.query(
    'INSERT INTO tasks (user_id, title, description, due_date, assigned_by) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [id, t.title, t.description, t.due_date, req.auth.id]
  );
  const { rows } = await db.query(`${TASK_SELECT} WHERE t.id = $1`, [ins.rows[0].id]);
  res.status(201).json({ task: rows[0] });
});

// Admin define o cargo/função de um usuário.
router.patch('/admin/users/:id', auth.requireAuth, auth.requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identificador inválido.' });

  const body = req.body || {};
  if (body.cargo === undefined) return res.status(400).json({ error: 'Nada para atualizar.' });
  const cargo = String(body.cargo).trim() || null;
  if (cargo && cargo.length > 60) return res.status(400).json({ error: 'O cargo está muito longo.' });

  const { rows } = await db.query('UPDATE users SET cargo = $1 WHERE id = $2 RETURNING *', [cargo, id]);
  if (!rows[0]) return res.status(404).json({ error: 'Usuário não encontrado.' });
  res.json({ user: publicUser(rows[0]) });
});

module.exports = router;
