'use strict';

/* ═══════════════════════════════════════════════════════════════
   Raíz Digital · Diário de bordo — lógica da interface
   ═══════════════════════════════════════════════════════════════ */

const state = {
  user: null,
  config: { allowRegistration: true, requireCode: false },
  tasks: [],
  filter: 'all',
  view: 'mine',
  team: { members: [], selectedId: null, tasks: [] },
};

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
};

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
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

function formatDoneAt(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) +
    ' às ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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
function taskItem(task, readOnly = false) {
  const li = document.createElement('li');
  li.className = 'task' + (task.done ? ' is-done' : '');
  li.dataset.id = task.id;

  const meta = [];
  if (task.due_date && !task.done) {
    meta.push(
      `<span class="tag ${dueClass(task.due_date)}">${ICONS.calendar}${
        task.due_date < todayYMD() ? 'Atrasada · ' : ''
      }${escapeHtml(formatDate(task.due_date))}</span>`
    );
  }
  if (task.done && task.done_at) {
    meta.push(`<span class="tag tag--done">${ICONS.check}Concluída ${escapeHtml(formatDoneAt(task.done_at))}</span>`);
  } else if (task.due_date && task.done) {
    meta.push(`<span class="tag tag--due">${ICONS.calendar}${escapeHtml(formatDate(task.due_date))}</span>`);
  }

  const actions = readOnly
    ? ''
    : `<div class="task__actions">
         <button class="icon-btn" data-action="edit" title="Editar">${ICONS.edit}</button>
         <button class="icon-btn is-danger" data-action="delete" title="Excluir">${ICONS.trash}</button>
       </div>`;

  li.innerHTML = `
    <button class="check ${task.done ? 'is-on' : ''}" data-action="toggle"
            title="${task.done ? 'Desmarcar' : 'Marcar como feita'}"
            aria-pressed="${task.done}" ${readOnly ? 'disabled' : ''}>${ICONS.check}</button>
    <div class="task__body">
      <div class="task__title">${escapeHtml(task.title)}</div>
      ${task.description ? `<div class="task__desc">${escapeHtml(task.description)}</div>` : ''}
      ${meta.length ? `<div class="task__meta">${meta.join('')}</div>` : ''}
    </div>
    ${actions}
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

  // Barra de progresso
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
  items.forEach((t) => frag.appendChild(taskItem(t)));
  list.appendChild(frag);
}

/* ── Ações de tarefa ───────────────────────────────────────────── */
async function loadTasks() {
  const { tasks } = await api('/tasks');
  state.tasks = tasks;
  renderTasks();
}

async function toggleTask(id, done) {
  // Atualização otimista
  const task = state.tasks.find((t) => t.id === id);
  if (task) {
    task.done = done;
    task.done_at = done ? new Date().toISOString() : null;
    renderTasks();
  }
  try {
    const { task: updated } = await api(`/tasks/${id}`, { method: 'PATCH', body: { done } });
    Object.assign(
      state.tasks.find((t) => t.id === id),
      updated
    );
    // Reordena (pendentes primeiro) recarregando do servidor.
    await loadTasks();
  } catch (err) {
    toast(err.message, true);
    await loadTasks();
  }
}

async function deleteTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!confirm(`Excluir "${task ? task.title : 'esta tarefa'}"? Essa ação não pode ser desfeita.`)) return;
  try {
    await api(`/tasks/${id}`, { method: 'DELETE' });
    state.tasks = state.tasks.filter((t) => t.id !== id);
    renderTasks();
    toast('Tarefa excluída.');
  } catch (err) {
    toast(err.message, true);
  }
}

/* ── Modal de edição ───────────────────────────────────────────── */
function openEdit(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
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

/* ── Painel da equipe (admin) ──────────────────────────────────── */
async function loadTeam() {
  const { users } = await api('/admin/users');
  state.team.members = users;
  renderMembers();
  const target = state.team.selectedId || (users[0] && users[0].id);
  if (target) await selectMember(target);
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
  state.team.tasks = tasks;

  const header = $('#team-header');
  const done = tasks.filter((t) => t.done).length;
  header.hidden = false;
  header.innerHTML = `
    <span class="avatar">${escapeHtml(initials(user.name))}</span>
    <div>
      <h2>${escapeHtml(user.name)}</h2>
      <p>${escapeHtml(user.email)} · ${done}/${tasks.length} concluídas</p>
    </div>
  `;

  const list = $('#team-tasks');
  const empty = $('#team-empty');
  list.innerHTML = '';
  if (tasks.length === 0) {
    empty.hidden = false;
    empty.innerHTML = '<strong>Sem tarefas</strong>Esta pessoa ainda não registrou nada no diário.';
    return;
  }
  empty.hidden = true;
  const frag = document.createDocumentFragment();
  tasks.forEach((t) => frag.appendChild(taskItem(t, true)));
  list.appendChild(frag);
}

/* ── Alternância de telas ──────────────────────────────────────── */
function setView(view) {
  state.view = view;
  $('#view-mine').hidden = view !== 'mine';
  $('#view-team').hidden = view !== 'team';
  $$('.nav__link').forEach((b) => b.classList.toggle('is-active', b.dataset.view === view));
  if (view === 'team') loadTeam();
}

function showApp() {
  $('#auth-view').hidden = true;
  $('#app-view').hidden = false;

  $('#who-name').textContent = state.user.name;
  const roleEl = $('#who-role');
  const isAdmin = state.user.role === 'admin';
  roleEl.textContent = isAdmin ? 'Administrador' : 'Membro';
  roleEl.classList.toggle('is-admin', isAdmin);
  $('#nav').hidden = !isAdmin;

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
  // Abas de acesso
  $$('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

  // Login
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

  // Cadastro
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

  // Sair
  $('#btn-logout').addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    state.user = null;
    state.tasks = [];
    showAuth();
  });

  // Navegação admin
  $$('.nav__link').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  // Nova tarefa
  $('#form-task').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const title = f.title.value.trim();
    if (!title) return;
    try {
      const { task } = await api('/tasks', {
        method: 'POST',
        body: {
          title,
          description: f.description.value.trim(),
          due_date: f.due_date.value || null,
        },
      });
      state.tasks.unshift(task);
      await loadTasks();
      f.reset();
      f.title.focus();
    } catch (err) {
      toast(err.message, true);
    }
  });

  // Filtros
  $$('.filter').forEach((b) =>
    b.addEventListener('click', () => {
      state.filter = b.dataset.filter;
      $$('.filter').forEach((x) => x.classList.toggle('is-active', x === b));
      renderTasks();
    })
  );

  // Ações dentro da lista de tarefas (delegação)
  $('#task-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = Number(btn.closest('.task').dataset.id);
    const action = btn.dataset.action;
    if (action === 'toggle') {
      const task = state.tasks.find((t) => t.id === id);
      toggleTask(id, !task.done);
    } else if (action === 'edit') {
      openEdit(id);
    } else if (action === 'delete') {
      deleteTask(id);
    }
  });

  // Seleção de membro (delegação)
  $('#members').addEventListener('click', (e) => {
    const btn = e.target.closest('.member');
    if (btn) selectMember(Number(btn.dataset.id));
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
      await loadTasks();
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

  // Configuração do servidor (adapta o formulário de cadastro)
  try {
    state.config = await api('/config');
  } catch (_e) {
    /* usa padrão */
  }
  $('#field-code').hidden = !state.config.requireCode;
  if (!state.config.allowRegistration) {
    $('[data-tab="register"]').hidden = true;
  }

  // Já está logado?
  try {
    const { user } = await api('/auth/me');
    state.user = user;
    showApp();
  } catch (_e) {
    showAuth();
  }
}

document.addEventListener('DOMContentLoaded', boot);
