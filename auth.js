'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-desenvolvimento-troque-em-producao';
const COOKIE_NAME = 'raiz_sessao';
const IS_PROD = process.env.NODE_ENV === 'production';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    maxAge: MAX_AGE_MS,
    path: '/',
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    path: '/',
  });
}

// Exige um usuário autenticado; preenche req.auth = { id, role }.
function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Você precisa entrar para continuar.' });
  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch (_err) {
    clearAuthCookie(res);
    return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
  }
}

// Exige papel de administrador (usar depois de requireAuth).
function requireAdmin(req, res, next) {
  if (!req.auth || req.auth.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
  }
  next();
}

module.exports = {
  COOKIE_NAME,
  hashPassword,
  verifyPassword,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
  requireAdmin,
};
