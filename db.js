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
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);`);
}

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  init,
};
