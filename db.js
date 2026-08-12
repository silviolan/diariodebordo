'use strict';

const pg = require('pg');

// Retorna colunas DATE como texto "AAAA-MM-DD" (evita bugs de fuso horário).
pg.types.setTypeParser(1082, (value) => value);

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn(
    '[db] DATABASE_URL não definido. Configure a string de conexão do PostgreSQL ' +
      '(no Render ela é preenchida automaticamente pelo blueprint).'
  );
}

// Provedores gerenciados (Render, Neon, Supabase...) exigem SSL.
// Em localhost, desativamos para não dar erro de certificado.
const isLocal = /localhost|127\.0\.0\.1/.test(connectionString || '');
const pool = new pg.Pool({
  connectionString,
  ssl: connectionString && !isLocal ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('[db] Erro inesperado no pool de conexões:', err);
});

// Cria as tabelas na primeira execução (idempotente).
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      name          TEXT NOT NULL,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'member',
      cargo         TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      description TEXT,
      due_date    DATE,
      done        BOOLEAN NOT NULL DEFAULT false,
      done_at     TIMESTAMPTZ,
      assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id         SERIAL PRIMARY KEY,
      task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      author_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body       TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Migrações para bancos que já existiam antes destas colunas (idempotente).
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS cargo TEXT;`);
  await pool.query(
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL;`
  );

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id);`);
}

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  init,
};
