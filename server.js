'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const db = require('./db');
const api = require('./api');

const app = express();
const PORT = process.env.PORT || 3000;

// O Render fica atrás de um proxy; necessário para cookies "secure".
app.set('trust proxy', 1);

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Cabeçalhos básicos de segurança.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

// API.
app.use('/api', api);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

// Arquivos estáticos do site.
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// Qualquer outra rota devolve a página principal.
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

db.init()
  .then(() => {
    app.listen(PORT, () => console.log(`Raíz Digital rodando em http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('Falha ao inicializar o banco de dados:', err);
    process.exit(1);
  });
