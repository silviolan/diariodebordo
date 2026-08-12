'use strict';

/* ═══════════════════════════════════════════════════════════════
   Raíz Digital · Diário de bordo — lógica da interface
   ═══════════════════════════════════════════════════════════════ */

const state = {
  user: null,
  config: { allowRegistration: true, requireCode: false, emailEnabled: false },
  tasks: [],
  news: [],
  filter: 'all',
  view: 'mine',
  team: { members: [], selectedId: null, selectedUser: null, tasks: [] },
};

let editContext = 'mine'; // contexto do modal de edição: 'mine' | 'team'

/* ── Utilidades ────────────────────────────────────────────────── */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data = {};
  try {
    data = await res.json();
  } catch (_e) {
    /* resposta sem corpo */
  }
  if (!res.ok) throw new Error(data.error || 'Algo deu errado. Tente novamente.');
  return data;
}

const ICONS = {
  check: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
  calendar:
    '<svg viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  trash:
    '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>',
  comment:
    '<svg viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.6-.8L3 21l1.9-5.4A8.4 8.4 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z"/></svg>',
  badge:
    '<svg viewBox="0 0 24 24"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7-7A2 2 0 0 1 3 12.2V5a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6l7 7a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.3"/></svg>',
  link:
    '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/></svg>',
};

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/);
  const first = parts[0]?.[0] || '?';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/* ── Datas (sem sustos de fuso horário) ────────────────────────── */
function todayYMD() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function ymdToLocal(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(ymd) {
  if (!ymd) return '';
  const today = todayYMD();
  if (ymd === today) return 'Hoje';

  const date = ymdToLocal(ymd);
  const tomorrow = ymdToLocal(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.getTime() === tomorrow.getTime()) return 'Amanhã';

  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
  });
}

function formatStamp(iso) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) +
    ' às ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  );
}

function dueClass(ymd) {
  const today = todayYMD();
  if (ymd < today) return 'tag--late';
  if (ymd === today) return 'tag--today';
  return 'tag--due';
}

/* ── Toast ─────────────────────────────────────────────────────── */
let toastTimer;
function toast(message, isError = false) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.toggle('is-error', isError);
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('is-show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('is-show');
    setTimeout(() => (el.hidden = true), 220);
  }, 2600);
}

/* ── Renderização das tarefas ──────────────────────────────────── */
// ctx: 'mine' (dono gerencia, marca a caixinha) | 'team' (admin observa e gerencia)
function taskItem(task, ctx) {
  const li = document.createElement('li');
  li.className = 'task' + (task.done ? ' is-done' : '');
  li.dataset.id = task.id;
  li.dataset.ctx = ctx;

  const interactiveCheck = ctx === 'mine';

  const meta = [];
  if (task.assigned_by_name) {
    meta.push(
      `<span class="tag tag--assigned">${ICONS.badge}Atribuída por ${escapeHtml(task.assigned_by_name)}</span>`
    );
  }
  if (task.due_date && !task.done) {
    meta.push(
      `<span class="tag ${dueClass(task.due_date)}">${ICONS.calendar}${
        task.due_date < todayYMD() ? 'Atrasada · ' : ''
      }${escapeHtml(formatDate(task.due_date))}</span>`
    );
  }
  if (task.done && task.done_at) {
    meta.push(`<span class="tag tag--done">${ICONS.check}Concluída ${escapeHtml(formatStamp(task.done_at))}</span>`);
  } else if (task.due_date && task.done) {
    meta.push(`<span class="tag tag--due">${ICONS.calendar}${escapeHtml(formatDate(task.due_date))}</span>`);
  }

  li.innerHTML = `
    <button class="check ${task.done ? 'is-on' : ''}" data-action="toggle"
            title="${task.done ? 'Concluída' : 'Marcar como feita'}"
            aria-pressed="${task.done}" ${interactiveCheck ? '' : 'disabled'}>${ICONS.check}</button>
    <div class="task__body">
      <div class="task__title">${escapeHtml(task.title)}</div>
      ${task.description ? `<div class="task__desc">${escapeHtml(task.description)}</div>` : ''}
      ${meta.length ? `<div class="task__meta">${meta.join('')}</div>` : ''}
    </div>
    <div class="task__actions">
      <button class="cbtn" data-action="comments" title="Comentários">
        ${ICONS.comment}<span class="cbtn__n">${task.comment_count || 0}</span>
      </button>
      <button class="icon-btn" data-action="edit" title="Editar">${ICONS.edit}</button>
      <button class="icon-btn is-danger" data-action="delete" title="Excluir">${ICONS.trash}</button>
    </div>
  `;
  return li;
}

function renderTasks() {
  const list = $('#task-list');
  const empty = $('#task-empty');
  list.innerHTML = '';

  let items = state.tasks;
  if (state.filter === 'pending') items = items.filter((t) => !t.done);
  if (state.filter === 'done') items = items.filter((t) => t.done);

  const total = state.tasks.length;
  const done = state.tasks.filter((t) => t.done).length;

  const progress = $('#progress');
  if (total > 0) {
    progress.hidden = false;
    $('#progress-fill').style.width = `${Math.round((done / total) * 100)}%`;
    $('#progress-label').textContent = `${done} de ${total} concluída${total === 1 ? '' : 's'}`;
  } else {
    progress.hidden = true;
  }

  if (items.length === 0) {
    empty.hidden = false;
    if (total === 0) {
      empty.innerHTML = '<strong>Seu diário está limpo</strong>Adicione a primeira tarefa acima para começar.';
    } else if (state.filter === 'pending') {
      empty.innerHTML = '<strong>Tudo em dia ✦</strong>Nenhuma tarefa pendente por aqui.';
    } else {
      empty.innerHTML = '<strong>Nada concluído ainda</strong>As tarefas que você marcar aparecem aqui.';
    }
    return;
  }
  empty.hidden = true;

  const frag = document.createDocumentFragment();
  items.forEach((t) => frag.appendChild(taskItem(t, 'mine')));
  list.appendChild(frag);
}

/* ── Ações de tarefa ───────────────────────────────────────────── */
async function loadTasks() {
  const { tasks } = await api('/tasks');
  state.tasks = tasks;
  renderTasks();
}

async function toggleTask(id, done) {
  const task = state.tasks.find((t) => t.id === id);
  if (task) {
    task.done = done;
    task.done_at = done ? new Date().toISOString() : null;
    renderTasks();
  }
  try {
    await api(`/tasks/${id}`, { method: 'PATCH', body: { done } });
    await loadTasks(); // reordena (pendentes primeiro)
  } catch (err) {
    toast(err.message, true);
    await loadTasks();
  }
}

async function deleteTask(id, ctx) {
  const src = ctx === 'team' ? state.team.tasks : state.tasks;
  const task = src.find((t) => t.id === id);
  if (!confirm(`Excluir "${task ? task.title : 'esta tarefa'}"? Essa ação não pode ser desfeita.`)) return;
  try {
    await api(`/tasks/${id}`, { method: 'DELETE' });
    if (ctx === 'team') {
      await selectMember(state.team.selectedId);
      await refreshMembers();
    } else {
      state.tasks = state.tasks.filter((t) => t.id !== id);
      renderTasks();
    }
    toast('Tarefa excluída.');
  } catch (err) {
    toast(err.message, true);
  }
}

/* ── Comentários ───────────────────────────────────────────────── */
function commentRow(c) {
  const canDelete = c.author_id === state.user.id || state.user.role === 'admin';
  const adminTag = c.author_role === 'admin' ? '<span class="comment__admin">admin</span>' : '';
  return `
    <li class="comment" data-id="${c.id}">
      <div class="comment__head">
        <span class="comment__who">${escapeHtml(c.author_name)}${adminTag}</span>
        <span class="comment__time">${escapeHtml(formatStamp(c.created_at))}</span>
        ${canDelete ? '<button class="comment__del" data-action="del-comment" title="Excluir comentário">×</button>' : ''}
      </div>
      <div class="comment__body">${escapeHtml(c.body)}</div>
    </li>`;
}

function renderCommentPanel(panel, taskId, comments) {
  panel.innerHTML = `
    <ul class="comments__list">
      ${comments.length ? comments.map(commentRow).join('') : '<li class="comments__empty">Nenhum comentário ainda.</li>'}
    </ul>
    <form class="comments__form" data-task="${taskId}">
      <input class="comments__input" name="body" placeholder="Escrever um comentário…" maxlength="1000" autocomplete="off" />
      <button class="btn btn--primary btn--sm" type="submit">Enviar</button>
    </form>`;
}

async function toggleComments(taskEl, taskId) {
  const existing = taskEl.querySelector('.comments');
  if (existing) {
    existing.remove();
    return;
  }
  const panel = document.createElement('div');
  panel.className = 'comments';
  panel.innerHTML = '<div class="comments__loading">Carregando…</div>';
  taskEl.appendChild(panel);
  try {
    const { comments } = await api(`/tasks/${taskId}/comments`);
    renderCommentPanel(panel, taskId, comments);
    const input = panel.querySelector('.comments__input');
    if (input) input.focus();
  } catch (err) {
    panel.innerHTML = `<div class="comments__loading">${escapeHtml(err.message)}</div>`;
  }
}

function bumpCommentCount(taskId, delta) {
  [...state.tasks, ...state.team.tasks].forEach((t) => {
    if (t.id === taskId) t.comment_count = Math.max(0, (t.comment_count || 0) + delta);
  });
  $$(`.task[data-id="${taskId}"] .cbtn__n`).forEach((el) => {
    el.textContent = Math.max(0, (parseInt(el.textContent, 10) || 0) + delta);
  });
}

async function deleteComment(commentId, taskId, commentEl) {
  try {
    await api(`/comments/${commentId}`, { method: 'DELETE' });
    const list = commentEl.parentElement;
    commentEl.remove();
    bumpCommentCount(taskId, -1);
    if (list && !list.querySelector('.comment')) {
      list.innerHTML = '<li class="comments__empty">Nenhum comentário ainda.</li>';
    }
  } catch (err) {
    toast(err.message, true);
  }
}

/* ── Modal de edição ───────────────────────────────────────────── */
function openEdit(id, ctx) {
  const src = ctx === 'team' ? state.team.tasks : state.tasks;
  const task = src.find((t) => t.id === id);
  if (!task) return;
  editContext = ctx;
  const form = $('#form-edit');
  form.id.value = task.id;
  form.title.value = task.title;
  form.description.value = task.description || '';
  form.due_date.value = task.due_date || '';
  $('#modal').hidden = false;
  setTimeout(() => form.title.focus(), 40);
}

function closeModal() {
  $('#modal').hidden = true;
}

/* ── Delegação de cliques nas listas de tarefas ────────────────── */
function wireTaskList(listEl, ctx) {
  listEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const taskEl = btn.closest('.task');
    if (!taskEl) return;
    const id = Number(taskEl.dataset.id);
    const action = btn.dataset.action;

    if (action === 'toggle') {
      const task = state.tasks.find((t) => t.id === id);
      if (task) toggleTask(id, !task.done);
    } else if (action === 'edit') {
      openEdit(id, ctx);
    } else if (action === 'delete') {
      deleteTask(id, ctx);
    } else if (action === 'comments') {
      toggleComments(taskEl, id);
    } else if (action === 'del-comment') {
      const commentEl = btn.closest('.comment');
      if (commentEl) deleteComment(Number(commentEl.dataset.id), id, commentEl);
    }
  });
}

/* ── Painel da equipe (admin) ──────────────────────────────────── */
async function loadTeam() {
  await refreshMembers();
  const target = state.team.selectedId || (state.team.members[0] && state.team.members[0].id);
  if (target) await selectMember(target);
}

async function refreshMembers() {
  const { users } = await api('/admin/users');
  state.team.members = users;
  renderMembers();
}

function renderMembers() {
  const ul = $('#members');
  ul.innerHTML = '';
  state.team.members.forEach((m) => {
    const pct = m.total ? Math.round((m.concluidas / m.total) * 100) : 0;
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'member' + (m.id === state.team.selectedId ? ' is-active' : '');
    btn.dataset.id = m.id;
    btn.innerHTML = `
      <span class="avatar">${escapeHtml(initials(m.name))}</span>
      <span class="member__info">
        <span class="member__name">${escapeHtml(m.name)}</span>
        ${m.cargo ? `<span class="member__cargo">${escapeHtml(m.cargo)}</span>` : ''}
        <span class="member__stat">${m.concluidas}/${m.total} concluídas</span>
        <span class="mini"><span style="width:${pct}%"></span></span>
      </span>
      ${m.role === 'admin' ? '<span class="member__badge">admin</span>' : ''}
    `;
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

async function selectMember(id) {
  state.team.selectedId = id;
  renderMembers();
  const { user, tasks } = await api(`/admin/users/${id}/tasks`);
  state.team.selectedUser = user;
  state.team.tasks = tasks;

  const header = $('#team-header');
  const done = tasks.filter((t) => t.done).length;
  header.hidden = false;
  header.innerHTML = `
    <span class="avatar">${escapeHtml(initials(user.name))}</span>
    <div class="team__headinfo">
      <h2>${escapeHtml(user.name)}</h2>
      <p>${escapeHtml(user.email)} · ${done}/${tasks.length} concluídas</p>
      <div class="cargo" id="cargo-box"></div>
    </div>
  `;
  renderCargoBox(user, false);

  $('#form-assign').hidden = false;

  const list = $('#team-tasks');
  const empty = $('#team-empty');
  list.innerHTML = '';
  if (tasks.length === 0) {
    empty.hidden = false;
    empty.innerHTML = '<strong>Sem tarefas</strong>Atribua a primeira demanda acima ou aguarde os registros desta pessoa.';
    return;
  }
  empty.hidden = true;
  const frag = document.createDocumentFragment();
  tasks.forEach((t) => frag.appendChild(taskItem(t, 'team')));
  list.appendChild(frag);
}

/* ── Cargo / função (admin edita) ──────────────────────────────── */
function renderCargoBox(user, editing) {
  const box = $('#cargo-box');
  if (!box) return;

  if (editing) {
    box.innerHTML = `
      <input class="cargo__input" id="cargo-input" maxlength="60"
             placeholder="Ex.: Design, Back-end, Redes…" value="${escapeHtml(user.cargo || '')}" />
      <button class="btn btn--primary btn--sm" id="cargo-save">Salvar</button>
      <button class="btn btn--ghost btn--sm" id="cargo-cancel">Cancelar</button>`;
    const input = $('#cargo-input');
    input.focus();
    input.select();
    $('#cargo-save').onclick = () => saveCargo(user.id, input.value);
    $('#cargo-cancel').onclick = () => renderCargoBox(user, false);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveCargo(user.id, input.value);
      } else if (e.key === 'Escape') {
        renderCargoBox(user, false);
      }
    });
  } else {
    box.innerHTML = `
      ${
        user.cargo
          ? `<span class="tag tag--cargo">${ICONS.badge}${escapeHtml(user.cargo)}</span>`
          : '<span class="cargo__empty">Sem cargo definido</span>'
      }
      <button class="btn btn--ghost btn--sm" id="cargo-edit">${user.cargo ? 'Editar cargo' : 'Definir cargo'}</button>`;
    $('#cargo-edit').onclick = () => renderCargoBox(user, true);
  }
}

async function saveCargo(userId, value) {
  try {
    const { user } = await api(`/admin/users/${userId}`, { method: 'PATCH', body: { cargo: value.trim() } });
    state.team.selectedUser = user;
    const m = state.team.members.find((x) => x.id === userId);
    if (m) m.cargo = user.cargo;
    renderMembers();
    renderCargoBox(user, false);
    toast('Cargo atualizado.');
  } catch (err) {
    toast(err.message, true);
  }
}

/* ── Quadro de avisos ──────────────────────────────────────────── */
async function loadNews() {
  const { announcements } = await api('/announcements');
  state.news = announcements;
  renderNews();
}

function announcementCard(n) {
  const li = document.createElement('li');
  li.className = 'news-item';
  li.dataset.id = n.id;

  const isAdmin = state.user.role === 'admin';
  let linkHtml = '';
  if (n.link) {
    linkHtml = `<a class="news-item__link" href="${escapeHtml(n.link)}" target="_blank" rel="noopener noreferrer">
      ${ICONS.link}${escapeHtml(n.link)}</a>`;
  }

  li.innerHTML = `
    <div class="news-item__head">
      <h3 class="news-item__title">${escapeHtml(n.title)}</h3>
      ${isAdmin ? `<button class="icon-btn is-danger" data-action="del-news" title="Excluir aviso">${ICONS.trash}</button>` : ''}
    </div>
    ${n.body ? `<div class="news-item__body">${escapeHtml(n.body)}</div>` : ''}
    ${linkHtml}
    <div class="news-item__meta">${escapeHtml(n.author_name || 'Equipe')} · ${escapeHtml(formatStamp(n.created_at))}</div>
  `;
  return li;
}

function renderNews() {
  const list = $('#news-list');
  const empty = $('#news-empty');
  list.innerHTML = '';

  if (state.news.length === 0) {
    empty.hidden = false;
    empty.innerHTML =
      state.user.role === 'admin'
        ? '<strong>Nenhum aviso ainda</strong>Publique a primeira notícia acima para a equipe.'
        : '<strong>Nenhum aviso ainda</strong>Quando o administrador publicar algo, aparece aqui.';
    return;
  }
  empty.hidden = true;
  const frag = document.createDocumentFragment();
  state.news.forEach((n) => frag.appendChild(announcementCard(n)));
  list.appendChild(frag);
}

async function deleteAnnouncement(id) {
  const n = state.news.find((x) => x.id === id);
  if (!confirm(`Excluir o aviso "${n ? n.title : ''}"?`)) return;
  try {
    await api(`/announcements/${id}`, { method: 'DELETE' });
    state.news = state.news.filter((x) => x.id !== id);
    renderNews();
    toast('Aviso excluído.');
  } catch (err) {
    toast(err.message, true);
  }
}

/* ── Alternância de telas ──────────────────────────────────────── */
function setView(view) {
  state.view = view;
  $('#view-mine').hidden = view !== 'mine';
  $('#view-news').hidden = view !== 'news';
  $('#view-team').hidden = view !== 'team';
  $$('.nav__link').forEach((b) => b.classList.toggle('is-active', b.dataset.view === view));
  if (view === 'team') loadTeam().catch((err) => toast(err.message, true));
  if (view === 'news') loadNews().catch((err) => toast(err.message, true));
}

function showApp() {
  $('#auth-view').hidden = true;
  $('#app-view').hidden = false;

  $('#who-name').textContent = state.user.name;
  const roleEl = $('#who-role');
  const isAdmin = state.user.role === 'admin';
  const roleParts = [isAdmin ? 'Administrador' : 'Membro'];
  if (state.user.cargo) roleParts.push(state.user.cargo);
  roleEl.textContent = roleParts.join(' · ');
  roleEl.classList.toggle('is-admin', isAdmin);

  // Navegação: todos veem "Minhas tarefas" e "Avisos"; só admin vê "Equipe".
  $('#nav').hidden = false;
  $$('#nav [data-admin]').forEach((el) => (el.hidden = !isAdmin));
  // Composer de avisos e opção de e-mail só para o admin.
  $('#form-news').hidden = !isAdmin;
  $('#news-notify-wrap').hidden = !(isAdmin && state.config.emailEnabled);

  setView('mine');
  loadTasks().catch((err) => toast(err.message, true));
}

function showAuth() {
  $('#app-view').hidden = true;
  $('#auth-view').hidden = false;
}

/* ── Autenticação ──────────────────────────────────────────────── */
function authError(message) {
  const el = $('#auth-error');
  if (!message) {
    el.hidden = true;
    return;
  }
  el.textContent = message;
  el.hidden = false;
}

function switchTab(tab) {
  $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === tab));
  $('#form-login').hidden = tab !== 'login';
  $('#form-register').hidden = tab !== 'register';
  authError('');
}

/* ── Inicialização ─────────────────────────────────────────────── */
function hydrateLogos() {
  const tpl = $('#tpl-logo');
  $$('[data-logo]').forEach((slot) => slot.appendChild(tpl.content.cloneNode(true)));
}

function bindEvents() {
  $$('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

  $('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    authError('');
    const f = e.target;
    try {
      const { user } = await api('/auth/login', {
        method: 'POST',
        body: { email: f.email.value, password: f.password.value },
      });
      state.user = user;
      f.reset();
      showApp();
    } catch (err) {
      authError(err.message);
    }
  });

  $('#form-register').addEventListener('submit', async (e) => {
    e.preventDefault();
    authError('');
    const f = e.target;
    try {
      const { user } = await api('/auth/register', {
        method: 'POST',
        body: {
          name: f.name.value,
          email: f.email.value,
          password: f.password.value,
          code: f.code ? f.code.value : '',
        },
      });
      state.user = user;
      f.reset();
      showApp();
      toast(`Bem-vindo(a), ${user.name.split(' ')[0]}!`);
    } catch (err) {
      authError(err.message);
    }
  });

  $('#btn-logout').addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    state.user = null;
    state.tasks = [];
    showAuth();
  });

  $$('.nav__link').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  // Nova tarefa (própria)
  $('#form-task').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const title = f.title.value.trim();
    if (!title) return;
    try {
      await api('/tasks', {
        method: 'POST',
        body: { title, description: f.description.value.trim(), due_date: f.due_date.value || null },
      });
      await loadTasks();
      f.reset();
      f.title.focus();
    } catch (err) {
      toast(err.message, true);
    }
  });

  // Atribuir tarefa (admin, painel Equipe)
  $('#form-assign').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const title = f.title.value.trim();
    if (!title || !state.team.selectedId) return;
    try {
      await api(`/admin/users/${state.team.selectedId}/tasks`, {
        method: 'POST',
        body: { title, description: f.description.value.trim(), due_date: f.due_date.value || null },
      });
      f.reset();
      f.title.focus();
      await selectMember(state.team.selectedId);
      await refreshMembers();
      toast('Tarefa atribuída.');
    } catch (err) {
      toast(err.message, true);
    }
  });

  // Publicar aviso (admin)
  $('#form-news').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const title = f.title.value.trim();
    if (!title) return;
    try {
      const { announcement } = await api('/announcements', {
        method: 'POST',
        body: {
          title,
          body: f.body.value.trim(),
          link: f.link.value.trim(),
          notify: f.notify ? f.notify.checked : false,
        },
      });
      state.news.unshift(announcement);
      renderNews();
      const notified = state.config.emailEnabled && f.notify && f.notify.checked;
      f.reset();
      if (f.notify) f.notify.checked = true;
      f.title.focus();
      toast(notified ? 'Aviso publicado e enviado por e-mail.' : 'Aviso publicado.');
    } catch (err) {
      toast(err.message, true);
    }
  });

  // Excluir aviso (admin)
  $('#news-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="del-news"]');
    if (!btn) return;
    const id = Number(btn.closest('.news-item').dataset.id);
    deleteAnnouncement(id);
  });

  // Filtros
  $$('.filter').forEach((b) =>
    b.addEventListener('click', () => {
      state.filter = b.dataset.filter;
      $$('.filter').forEach((x) => x.classList.toggle('is-active', x === b));
      renderTasks();
    })
  );

  // Listas de tarefas
  wireTaskList($('#task-list'), 'mine');
  wireTaskList($('#team-tasks'), 'team');

  // Seleção de membro
  $('#members').addEventListener('click', (e) => {
    const btn = e.target.closest('.member');
    if (btn) selectMember(Number(btn.dataset.id)).catch((err) => toast(err.message, true));
  });

  // Envio de comentário (delegação global — funciona para painéis criados dinamicamente)
  document.addEventListener('submit', async (e) => {
    if (!e.target.classList || !e.target.classList.contains('comments__form')) return;
    e.preventDefault();
    const form = e.target;
    const taskId = Number(form.dataset.task);
    const body = form.body.value.trim();
    if (!body) return;
    try {
      const { comment } = await api(`/tasks/${taskId}/comments`, { method: 'POST', body: { body } });
      const list = form.parentElement.querySelector('.comments__list');
      const emptyRow = list.querySelector('.comments__empty');
      if (emptyRow) emptyRow.remove();
      list.insertAdjacentHTML('beforeend', commentRow(comment));
      form.body.value = '';
      bumpCommentCount(taskId, +1);
    } catch (err) {
      toast(err.message, true);
    }
  });

  // Modal de edição
  $('#form-edit').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const id = Number(f.id.value);
    try {
      await api(`/tasks/${id}`, {
        method: 'PATCH',
        body: {
          title: f.title.value.trim(),
          description: f.description.value.trim(),
          due_date: f.due_date.value || null,
        },
      });
      closeModal();
      if (editContext === 'team') {
        await selectMember(state.team.selectedId);
        await refreshMembers();
      } else {
        await loadTasks();
      }
      toast('Tarefa atualizada.');
    } catch (err) {
      toast(err.message, true);
    }
  });

  $$('[data-close]').forEach((el) => el.addEventListener('click', closeModal));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#modal').hidden) closeModal();
  });
}

async function boot() {
  hydrateLogos();
  bindEvents();

  try {
    state.config = await api('/config');
  } catch (_e) {
    /* usa padrão */
  }
  $('#field-code').hidden = !state.config.requireCode;
  if (!state.config.allowRegistration) {
    $('[data-tab="register"]').hidden = true;
  }

  try {
    const { user } = await api('/auth/me');
    state.user = user;
    showApp();
  } catch (_e) {
    showAuth();
  }
}

document.addEventListener('DOMContentLoaded', boot);
