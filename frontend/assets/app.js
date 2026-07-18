/**
 * RaspiClaw Frontend v2.0 — Multi-Session + Provider Management + File Upload + Web Search
 * REST + WebSocket communication
 */

const API_BASE = window.location.origin;
const WS_URL = `ws://${window.location.host}/ws/chat`;

// ─── Global State ─────────────────────────────────────────────────
const state = {
  ws: null,
  sessions: {},         // { sessionId: { messages:[], name, ... } }
  activeSession: null,
  currentView: 'chat',
  currentMemoryTab: 'identity',
  isStreaming: false,
  pendingFiles: [],     // Files to attach with next message
  providers: [],
  activeProviderId: '',
};

// ─── DOM Helpers ─────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ─── Init ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initChat();
  initConversationTabs();
  initFileUpload();
  initStopButton();
  initCopyButtons();
  initThemeToggle();
  initPermissionSelect();
  initSSH();
  initMemoryEditor();
  initSettings();
  initProviderManagement();
  loadSystemStatus();
  loadProviders();
  connectWebSocket();

  // Auto-shutdown when browser tab closes
  window.addEventListener('beforeunload', () => {
    navigator.sendBeacon(API_BASE + '/api/shutdown');
  });
});

// ─── Navigation ──────────────────────────────────────────────────
function initNavigation() {
  $$('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      switchView(view);
    });
  });
}

function switchView(viewName) {
  state.currentView = viewName;
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === viewName));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${viewName}`));
  if (viewName === 'skills') loadSkills();
  if (viewName === 'tasks') loadTasks();
  if (viewName === 'memory') loadMemory(state.currentMemoryTab);
  if (viewName === 'settings') { loadSettings(); loadProviderList(); }
}

// ─── WebSocket ───────────────────────────────────────────────────
function connectWebSocket() {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) return;
  state.ws = new WebSocket(WS_URL);
  state.ws.onopen = () => updateConnectionStatus(true);
  state.ws.onclose = () => { updateConnectionStatus(false); setTimeout(connectWebSocket, 3000); };
  state.ws.onerror = () => updateConnectionStatus(false);
  state.ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleStreamEvent(data);
    } catch (e) { console.error('WS parse error:', e); }
  };
}

function updateConnectionStatus(connected) {
  const dot = $('#connection-status .status-dot');
  const text = $('#connection-status .status-text');
  if (connected) {
    dot.className = 'status-dot connected';
    text.textContent = 'Connected';
  } else {
    dot.className = 'status-dot disconnected';
    text.textContent = 'Disconnected';
  }
}

// ─── Conversation Management ─────────────────────────────────────
function initConversationTabs() {
  $('#new-chat-btn').addEventListener('click', createNewConversation);
  // Start with default session
  createNewConversation();
}

async function createNewConversation() {
  try {
    const resp = await fetch(`${API_BASE}/api/sessions`, { method: 'POST' });
    const data = await resp.json();
    const sid = data.session_id;
    state.sessions[sid] = { name: `Chat ${Object.keys(state.sessions).length + 1}`, messages: [] };
    state.activeSession = sid;
    renderConversationTabs();
    switchToConversation(sid);
  } catch (e) {
    // Fallback: local-only session
    const sid = 'local-' + Date.now();
    state.sessions[sid] = { name: `Chat ${Object.keys(state.sessions).length + 1}`, messages: [] };
    state.activeSession = sid;
    renderConversationTabs();
    switchToConversation(sid);
  }
}

function renderConversationTabs() {
  const container = $('#conversation-list');
  container.innerHTML = Object.entries(state.sessions).map(([sid, s]) => `
    <div class="conv-tab ${sid === state.activeSession ? 'active' : ''}" data-sid="${sid}">
      <span class="conv-name">${escapeHtml(s.name)}</span>
      <button class="conv-close" data-sid="${sid}" title="Close">×</button>
    </div>
  `).join('');

  // Bind events
  container.querySelectorAll('.conv-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      if (e.target.classList.contains('conv-close')) return;
      switchToConversation(tab.dataset.sid);
    });
  });
  container.querySelectorAll('.conv-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeConversation(btn.dataset.sid);
    });
  });
}

function switchToConversation(sid) {
  state.activeSession = sid;
  renderConversationTabs();
  renderChatMessages();
  if ($('#chat-input')) $('#chat-input').focus();
}

async function closeConversation(sid) {
  const ids = Object.keys(state.sessions);
  if (ids.length <= 1) return; // Keep at least one

  // Stop any streaming
  if (state.isStreaming && state.activeSession === sid) {
    await stopGeneration();
  }

  try { await fetch(`${API_BASE}/api/sessions/${sid}`, { method: 'DELETE' }); } catch (e) {}

  delete state.sessions[sid];
  if (state.activeSession === sid) {
    const remaining = Object.keys(state.sessions);
    state.activeSession = remaining[remaining.length - 1] || null;
    switchToConversation(state.activeSession);
  } else {
    renderConversationTabs();
  }
}

// ─── Chat Functions ──────────────────────────────────────────────
function initChat() {
  const input = $('#chat-input');
  const sendBtn = $('#btn-send');
  const clearBtn = $('#btn-clear');

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });

  sendBtn.addEventListener('click', sendMessage);
  clearBtn.addEventListener('click', clearChat);

  // Quick action buttons (delegated)
  $('#chat-messages').addEventListener('click', (e) => {
    if (e.target.classList.contains('quick-btn')) {
      const msg = e.target.dataset.msg;
      if (msg) { $('#chat-input').value = msg; sendMessage(); }
    }
  });
}

async function sendMessage() {
  const input = $('#chat-input');
  const msg = input.value.trim();
  if (!msg || state.isStreaming) return;

  const sid = state.activeSession;
  if (!sid) return;

  // Attach files info if any
  let finalMsg = msg;
  if (state.pendingFiles.length > 0) {
    const fileInfo = state.pendingFiles.map(f => f.name).join(', ');
    finalMsg = `[Attached files: ${fileInfo}]\n${msg}`;
    state.pendingFiles = [];
    $('#attachments-preview').style.display = 'none';
    $('#attachments-preview').innerHTML = '';
  }

  input.value = '';
  input.style.height = 'auto';

  // Hide welcome
  const welcome = $('#chat-messages .welcome-message');
  if (welcome) welcome.style.display = 'none';

  // Add user message
  addMessageToSession(sid, 'user', finalMsg);
  appendMessageElement('user', finalMsg);

  // Show thinking
  const thinkingId = appendThinking();

  // Toggle UI for streaming
  state.isStreaming = true;
  $('#btn-send').disabled = true;
  $('#btn-stop').style.display = 'flex';
  $('#btn-attach').disabled = true;

  try {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({
        message: finalMsg,
        session_id: sid,
      }));
      state._currentThinkingId = thinkingId;
    } else {
      // REST fallback
      const resp = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: finalMsg, session_id: sid }),
      });
      const data = await resp.json();
      removeThinking(thinkingId);
      if (data.response) {
        addMessageToSession(sid, 'assistant', data.response);
        appendMessageElement('assistant', data.response);
      } else if (data.error) {
        appendMessageElement('system', 'Error: ' + data.error);
      }
      endStreaming();
    }
  } catch (e) {
    removeThinking(thinkingId);
    appendMessageElement('system', 'Connection failed: ' + e.message);
    endStreaming();
  }
}

function endStreaming() {
  state.isStreaming = false;
  $('#btn-send').disabled = false;
  $('#btn-stop').style.display = 'none';
  $('#btn-attach').disabled = false;
}

// ─── Stop Generation ────────────────────────────────────────────
function initStopButton() {
  $('#btn-stop').addEventListener('click', stopGeneration);
}

async function stopGeneration() {
  const sid = state.activeSession;
  if (!sid) return;
  try {
    await fetch(`${API_BASE}/api/stop/${sid}`, { method: 'POST' });
  } catch (e) {}
  // Close and reopen websocket to cancel server-side task
  if (state.ws) { state.ws.close(); state.ws = null; }
  setTimeout(connectWebSocket, 500);
  endStreaming();
  removeThinking(state._currentThinkingId);
}

// ─── File Upload ────────────────────────────────────────────────
function initFileUpload() {
  $('#btn-attach').addEventListener('click', () => $('#file-input').click());
  $('#btn-workdir-select').addEventListener('click', selectWorkDir);
  $('#file-input').addEventListener('change', handleFileSelect);
}

async function handleFileSelect(e) {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;

  const preview = $('#attachments-preview');
  preview.style.display = 'flex';

  for (const file of files) {
    state.pendingFiles.push(file);

    // Upload to server
    const formData = new FormData();
    formData.append('file', file);
    formData.append('session_id', state.activeSession || 'default');

    try {
      const resp = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: formData });
      const data = await resp.json();
      const chip = document.createElement('span');
      chip.className = 'attach-chip';
      chip.innerHTML = `${getFileIcon(file.name)} ${escapeHtml(file.name)} <button class="chip-remove" data-name="${escapeHtml(file.name)}">×</button>`;
      preview.appendChild(chip);
    } catch (e) {
      const chip = document.createElement('span');
      chip.className = 'attach-chip error';
      chip.textContent = `Failed: ${file.name}`;
      preview.appendChild(chip);
    }
  }

  // Bind remove buttons
  preview.querySelectorAll('.chip-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      state.pendingFiles = state.pendingFiles.filter(f => f.name !== btn.dataset.name);
      btn.parentElement.remove();
      if (state.pendingFiles.length === 0) {
        preview.style.display = 'none';
        preview.innerHTML = '';
      }
    });
  });

  $('#file-input').value = '';
}

function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const map = { pdf: '📄', docx: '📝', doc: '📝', xlsx: '📊', xls: '📊', pptx: '📽️', ppt: '📽️', py: '🐍', js: '📜', txt: '📃', md: '📋', csv: '📊', json: '📋', zip: '📦', png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️' };
  return map[ext] || '📎';
}

async function selectWorkDir() {
  const path = prompt('Enter work directory path:');
  if (!path) return;
  try {
    const resp = await fetch(`${API_BASE}/api/workdir?session_id=${encodeURIComponent(state.activeSession || 'default')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    const data = await resp.json();
    appendMessageElement('system', data.message || 'Work directory updated');
  } catch (e) {
    appendMessageElement('system', 'Failed to set work directory: ' + e.message);
  }
}

// ─── Stream Event Handling ──────────────────────────────────────
function handleStreamEvent(event) {
  const thinkingId = state._currentThinkingId;

  switch (event.type) {
    case 'start':
      break;

    case 'thinking':
      // Show model reasoning in a collapsible block
      if (thinkingId && state._currentThinkingBlock) {
        // Update existing thinking block
        updateThinkingBlock(state._currentThinkingBlock, event.content);
      } else if (thinkingId) {
        // First thinking event: replace dots with thinking block
        removeThinking(thinkingId);
        state._currentThinkingId = null;
        state._currentThinkingBlock = appendThinkingBlock(event.content);
      }
      break;

    case 'tool_call':
      // Collapse thinking block when tool is called
      collapseThinkingBlock();
      if (thinkingId) { removeThinking(thinkingId); state._currentThinkingId = null; }
      appendToolCall(event.name, event.args);
      break;

    case 'tool_result':
      appendToolResult(event.name, event.content);
      break;

    case 'final':
      // Collapse thinking and show final answer
      collapseThinkingBlock();
      if (thinkingId) { removeThinking(thinkingId); state._currentThinkingId = null; }
      addMessageToSession(state.activeSession, 'assistant', event.content);
      appendMessageElement('assistant', event.content);
      endStreaming();
      break;

    case 'done':
      collapseThinkingBlock();
      if (thinkingId) { removeThinking(thinkingId); state._currentThinkingId = null; }
      endStreaming();
      break;

    case 'stopped':
      collapseThinkingBlock();
      appendMessageElement('system', event.content || '[Generation stopped]');
      endStreaming();
      break;

    case 'error':
      collapseThinkingBlock();
      if (thinkingId) { removeThinking(thinkingId); state._currentThinkingId = null; }
      appendMessageElement('system', 'Error: ' + event.content);
      endStreaming();
      break;
  }
}

// ─── Session Memory ─────────────────────────────────────────────
function addMessageToSession(sid, role, content) {
  if (!state.sessions[sid]) return;
  state.sessions[sid].messages.push({ role, content, time: Date.now() });
}

function renderChatMessages() {
  const container = $('#chat-messages');
  const sid = state.activeSession;
  container.innerHTML = '';

  if (!sid || !state.sessions[sid] || state.sessions[sid].messages.length === 0) {
    container.innerHTML = `
      <div class="welcome-message">
        <div class="welcome-icon">🍓</div>
        <h3>欢迎使用 RaspiClaw</h3>
        <p>我是你的AI助手，具备以下能力:</p>
        <div class="capability-cards">
          <div class="cap-card">📊 <span>数据分析</span></div>
          <div class="cap-card">📝 <span>文件管理</span></div>
          <div class="cap-card">🧠 <span>记忆管理</span></div>
          <div class="cap-card">💻 <span>代码执行</span></div>
          <div class="cap-card">🌐 <span>Web Search</span></div>
        </div>
        <div class="quick-actions">
          <button class="quick-btn" data-msg="分析 summer.csv 数据">📊 数据分析</button>
          <button class="quick-btn" data-msg="你有哪些技能？">⚡ View Skills</button>
          <button class="quick-btn" data-msg="搜索最新AI新闻">🌐 Web Search</button>
        </div>
      </div>`;
    return;
  }

  state.sessions[sid].messages.forEach(m => {
    appendMessageElement(m.role, m.content, false);
  });
  container.scrollTop = container.scrollHeight;
}

function appendMessageElement(role, content, scroll = true) {
  const container = $('#chat-messages');
  const div = document.createElement('div');
  div.className = `message ${role}`;

  if (role === 'user') {
    div.innerHTML = `
      <div class="msg-content">${escapeHtml(content)}</div>
      <button class="btn-copy-msg" title="Copy">📋</button>
    `;
  } else if (role === 'assistant') {
    div.innerHTML = `
      <div class="msg-avatar">🍓</div>
      <div class="msg-content">${formatContent(content)}</div>
      <button class="btn-copy-msg" title="Copy">📋</button>
    `;
  } else {
    div.innerHTML = `<div class="msg-content">${escapeHtml(content)}</div>`;
  }

  // Bind copy button
  const copyBtn = div.querySelector('.btn-copy-msg');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      copyToClipboard(content);
      copyBtn.textContent = '✅';
      setTimeout(() => { copyBtn.textContent = '📋'; }, 1500);
    });
  }

  container.appendChild(div);
  if (scroll) container.scrollTop = container.scrollHeight;
  return div;
}

function appendThinking() {
  const container = $('#chat-messages');
  const div = document.createElement('div');
  div.className = 'message assistant';
  const id = 'thinking-' + Date.now();
  div.id = id;
  div.innerHTML = `
    <div class="msg-avatar">🍓</div>
    <div class="msg-content">
      <div class="thinking-dots"><span></span><span></span><span></span></div>
    </div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return id;
}

function removeThinking(id) {
  if (id) { const el = document.getElementById(id); if (el) el.remove(); }
}

// ─── Reasoning / Thinking Block ──────────────────────────────
function appendThinkingBlock(content) {
  const container = $('#chat-messages');
  const div = document.createElement('div');
  div.className = 'message assistant';
  const id = 'think-' + Date.now();
  div.id = id;
  const preview = summarizeThinking(content);
  div.innerHTML = `
    <div class="msg-avatar">🍓</div>
    <div class="msg-content">
      <div class="thinking-block">
        <div class="thinking-header" onclick="toggleThinkingBlock('${id}')">
          <span class="think-icon">🧠</span>
          <span class="think-label">Thinking</span>
          <span class="think-preview">${escapeHtml(preview)}</span>
          <span class="think-toggle">▸</span>
        </div>
        <div class="thinking-body" style="display:none;">
          <div class="thinking-text">${escapeHtml(content)}</div>
        </div>
      </div>
    </div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return id;
}

function updateThinkingBlock(id, content) {
  const el = document.getElementById(id);
  if (!el) return;
  const textEl = el.querySelector('.thinking-text');
  const previewEl = el.querySelector('.think-preview');
  if (textEl) textEl.textContent = content;
  if (previewEl) previewEl.textContent = summarizeThinking(content);
  const container = $('#chat-messages');
  container.scrollTop = container.scrollHeight;
}

function collapseThinkingBlock() {
  if (state._currentThinkingBlock) {
    const el = document.getElementById(state._currentThinkingBlock);
    if (el) {
      const body = el.querySelector('.thinking-body');
      const toggle = el.querySelector('.think-toggle');
      if (body && body.style.display !== 'none') {
        body.style.display = 'none';
        if (toggle) toggle.textContent = '▸';
      }
      el.querySelector('.thinking-header').classList.add('collapsed');
    }
    state._currentThinkingBlock = null;
  }
}

function toggleThinkingBlock(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const body = el.querySelector('.thinking-body');
  const toggle = el.querySelector('.think-toggle');
  const header = el.querySelector('.thinking-header');
  if (body.style.display === 'none') {
    body.style.display = 'block';
    if (toggle) toggle.textContent = '▾';
    header.classList.remove('collapsed');
  } else {
    body.style.display = 'none';
    if (toggle) toggle.textContent = '▸';
    header.classList.add('collapsed');
  }
}

function summarizeThinking(text) {
  if (!text) return '...';
  // Take first sentence or first 80 chars as preview
  const firstLine = text.split('\n')[0].trim();
  if (firstLine.length <= 80) return firstLine;
  return firstLine.substring(0, 80) + '...';
}

function appendToolCall(name, args) {
  const container = $('#chat-messages');
  const div = document.createElement('div');
  div.className = 'message assistant';
  const argsStr = typeof args === 'object' ? JSON.stringify(args, null, 2) : String(args);
  div.innerHTML = `
    <div class="msg-avatar">🍓</div>
    <div class="msg-content">
      <div class="tool-call-block">
        <div class="tool-call-header">🔧 ${escapeHtml(name)}</div>
        <div class="tool-call-body">${escapeHtml(argsStr)}</div>
      </div>
    </div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function appendToolResult(name, content) {
  const container = $('#chat-messages');
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.innerHTML = `
    <div class="msg-avatar">🍓</div>
    <div class="msg-content">
      <div class="tool-result-block">
        <div class="tool-result-header">✅ ${escapeHtml(name)}</div>
        <div class="tool-result-body">${escapeHtml(content)}</div>
      </div>
    </div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

async function clearChat() {
  const sid = state.activeSession;
  if (sid && state.sessions[sid]) {
    state.sessions[sid].messages = [];
  }
  renderChatMessages();
  try { await fetch(`${API_BASE}/api/clear?session_id=${encodeURIComponent(sid || 'default')}`, { method: 'POST' }); } catch (e) {}
}

function initCopyButtons() {
  // Copy buttons are bound inline when messages are created
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

// ─── System Status ──────────────────────────────────────────────
async function loadSystemStatus() {
  try {
    const resp = await fetch(`${API_BASE}/api/status`);
    const data = await resp.json();
    const provider = data.activeProvider;
    if (provider) {
      state._currentProviderModels = provider.models || {};
      updateTierSelect();
    } else {
      $('#tier-select').innerHTML = '<option value="">No Model</option>';
    }
  } catch (e) {
    $('#tier-select').innerHTML = '<option value="">Offline</option>';
  }
}

function updateTierSelect() {
  const models = state._currentProviderModels || {};
  const currentTier = models.default || 'sonnet';
  const tiers = [];
  if (models.opus) tiers.push(['opus', `Opus: ${models.opus}`]);
  if (models.sonnet) tiers.push(['sonnet', `Sonnet: ${models.sonnet}`]);
  if (models.haiku) tiers.push(['haiku', `Haiku: ${models.haiku}`]);
  $('#tier-select').innerHTML = tiers.map(([k,v]) =>
    `<option value="${k}" ${k === currentTier ? 'selected' : ''}>${escapeHtml(v)}</option>`
  ).join('');
}

// ─── Provider Management ────────────────────────────────────────
async function loadProviders() {
  try {
    const resp = await fetch(`${API_BASE}/api/providers`);
    const data = await resp.json();
    state.providers = data.providers || [];
    state.activeProviderId = data.activeId || '';
    updateProviderSelect();
  } catch (e) { console.error('Load providers error:', e); }
}

function updateProviderSelect() {
  const select = $('#provider-select');
  select.innerHTML = '<option value="">Select Provider</option>';
  state.providers.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    if (p.id === state.activeProviderId) opt.selected = true;
    select.appendChild(opt);
  });
}

function initProviderManagement() {
  $('#provider-select').addEventListener('change', async (e) => {
    const providerId = e.target.value;
    if (!providerId) return;
    try {
      const resp = await fetch(`${API_BASE}/api/providers/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_id: providerId }),
      });
      const data = await resp.json();
      if (data.status === 'ok') {
        state.activeProviderId = providerId;
        updateProviderSelect();
        loadSystemStatus();
        appendMessageElement('system', `Switched to ${data.activeProvider?.name || providerId}. Provider change takes effect on new conversations.`);
      }
    } catch (e) {
      appendMessageElement('system', 'Provider switch failed: ' + e.message);
    }
  });

  // Tier select: switch between opus/sonnet/haiku
  $('#tier-select').addEventListener('change', async (e) => {
    const tier = e.target.value;
    if (!tier || !state.activeProviderId) return;
    // Update default tier in providers.json, then switch
    const provider = state.providers.find(p => p.id === state.activeProviderId);
    if (!provider) return;
    provider.models.default = tier;
    await fetch(`${API_BASE}/api/providers/${state.activeProviderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ models: provider.models }),
    });
    await fetch(`${API_BASE}/api/providers/switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider_id: state.activeProviderId }),
    });
    updateTierSelect();
  });

  // Add provider modal
  $('#btn-add-provider')?.addEventListener('click', () => {
    $('#provider-modal-title').textContent = 'Add Provider';
    $('#provider-edit-id').value = '';
    $('#provider-name').value = '';
    $('#provider-apikey').value = '';
    $('#provider-baseurl').value = '';
    $('#provider-format').value = 'openai';
    $('#provider-runtime').value = 'deepseek';
    $('#provider-opus-model').value = '';
    $('#provider-sonnet-model').value = '';
    $('#provider-haiku-model').value = '';
    $('#provider-default-tier').value = 'sonnet';
    $('#provider-modal').style.display = 'flex';
  });

  $('#btn-close-provider-modal')?.addEventListener('click', () => {
    $('#provider-modal').style.display = 'none';
  });

  $('#btn-cancel-provider')?.addEventListener('click', () => {
    $('#provider-modal').style.display = 'none';
  });

  $('#btn-save-provider')?.addEventListener('click', saveProvider);

  // Close modal on overlay click
  $('#provider-modal')?.addEventListener('click', (e) => {
    if (e.target === $('#provider-modal')) {
      $('#provider-modal').style.display = 'none';
    }
  });
}

async function saveProvider() {
  const editId = $('#provider-edit-id').value;
  const provider = {
    name: $('#provider-name').value.trim(),
    apiKey: $('#provider-apikey').value.trim(),
    baseUrl: $('#provider-baseurl').value.trim(),
    apiFormat: $('#provider-format').value,
    runtimeKind: $('#provider-runtime').value,
    models: {
      opus: $('#provider-opus-model').value.trim(),
      sonnet: $('#provider-sonnet-model').value.trim(),
      haiku: $('#provider-haiku-model').value.trim(),
      default: $('#provider-default-tier').value,
    },
  };

  if (!provider.name || !provider.apiKey || !provider.baseUrl || !provider.models.sonnet) {
    alert('Please fill in all required fields: Name, API Key, Base URL, Sonnet Model');
    return;
  }

  try {
    let resp;
    if (editId) {
      resp = await fetch(`${API_BASE}/api/providers/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(provider),
      });
    } else {
      resp = await fetch(`${API_BASE}/api/providers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(provider),
      });
    }
    const data = await resp.json();
    if (data.status === 'ok') {
      $('#provider-modal').style.display = 'none';
      await loadProviders();
      loadProviderList();
      updateProviderSelect();
      // If editing the active provider, auto-reload the model
      if (editId === state.activeProviderId) {
        await fetch(`${API_BASE}/api/providers/switch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider_id: editId }),
        });
        loadSystemStatus();
      }
    }
  } catch (e) {
    alert('Failed to save provider: ' + e.message);
  }
}

async function editProvider(providerId) {
  const p = state.providers.find(p => p.id === providerId);
  if (!p) return;
  $('#provider-modal-title').textContent = 'Edit Provider';
  $('#provider-edit-id').value = p.id;
  $('#provider-name').value = p.name || '';
  $('#provider-apikey').value = p.apiKey || '';
  $('#provider-baseurl').value = p.baseUrl || '';
  $('#provider-format').value = p.apiFormat || 'openai';
  $('#provider-runtime').value = p.runtimeKind || 'deepseek';
  $('#provider-opus-model').value = (p.models && p.models.opus) || '';
  $('#provider-sonnet-model').value = (p.models && p.models.sonnet) || (p.models && p.models.main) || '';
  $('#provider-haiku-model').value = (p.models && p.models.haiku) || '';
  $('#provider-default-tier').value = (p.models && p.models.default) || 'sonnet';
  $('#provider-modal').style.display = 'flex';
}

async function deleteProvider(providerId) {
  if (!confirm('Delete this provider?')) return;
  try {
    await fetch(`${API_BASE}/api/providers/${providerId}`, { method: 'DELETE' });
    await loadProviders();
    loadProviderList();
  } catch (e) {
    alert('Failed to delete: ' + e.message);
  }
}

function loadProviderList() {
  const container = $('#provider-list');
  if (!container) return;
  container.innerHTML = state.providers.map(p => `
    <div class="provider-item ${p.id === state.activeProviderId ? 'active' : ''}">
      <div class="provider-info">
        <strong>${escapeHtml(p.name)}</strong>
        <span class="provider-model">${escapeHtml((p.models && (p.models.sonnet || p.models.main)) || '')}</span>
        <span class="provider-url">${escapeHtml(p.baseUrl || '')}</span>
      </div>
      <div class="provider-actions">
        <button class="btn-sm btn-secondary" onclick="editProvider('${p.id}')">Edit</button>
        <button class="btn-sm btn-danger" onclick="deleteProvider('${p.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

// ─── Skills Panel ────────────────────────────────────────────────
async function loadSkills() {
  try {
    const resp = await fetch(`${API_BASE}/api/skills`);
    const skills = await resp.json();
    $('#skills-list').innerHTML = skills.map(s => `
      <div class="skill-card">
        <h3>⚡ ${escapeHtml(s.name)}</h3>
        <p>${escapeHtml(s.description)}</p>
        <div class="skill-actions">
          <button class="btn-secondary" onclick="useSkill('${escapeHtml(s.name)}')">Use Skill</button>
          <button class="btn-secondary" onclick="viewSkillDetail('${escapeHtml(s.name)}')">Details</button>
        </div>
      </div>
    `).join('');
  } catch (e) { $('#skills-list').innerHTML = '<p>Load failed</p>'; }
}

function useSkill(name) {
  switchView('chat');
  $('#chat-input').value = `Use ${name} skill`;
  sendMessage();
}

async function viewSkillDetail(name) {
  try {
    const resp = await fetch(`${API_BASE}/api/skills/${name}`);
    const data = await resp.json();
    alert(data.content);
  } catch (e) {}
}

// ─── Theme Toggle ──────────────────────────────────────────────
function initThemeToggle() {
  const btn = $('#btn-theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    btn.textContent = next === 'dark' ? '🌙' : '☀️';
  });
}

// ─── Permission Select ─────────────────────────────────────────
function initPermissionSelect() {
  const sel = $('#permission-select');
  if (!sel) return;
  sel.addEventListener('change', async () => {
    const mode = sel.value;
    const sid = state.activeSession || 'default';
    try {
      await fetch(`${API_BASE}/api/permission/${sid}?mode=${mode}`, { method: 'POST' });
      appendMessageElement('system', '权限已切换为: ' + mode);
    } catch (e) {
      appendMessageElement('system', '权限切换失败: ' + e.message);
    }
  });
}

// ─── Memory Editor ──────────────────────────────────────────────
function initMemoryEditor() {
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentMemoryTab = btn.dataset.tab;
      loadMemory(btn.dataset.tab);
    });
  });
  $('#btn-save-memory').addEventListener('click', saveMemory);
}

async function loadMemory(tab) {
  try {
    const resp = await fetch(`${API_BASE}/api/memory?session_id=${encodeURIComponent(state.activeSession || 'default')}`);
    const data = await resp.json();
    $('#memory-editor').value = data[tab] || '';
  } catch (e) { $('#memory-editor').value = 'Load failed'; }
}

async function saveMemory() {
  const content = $('#memory-editor').value;
  const tab = state.currentMemoryTab;
  try {
    const resp = await fetch(`${API_BASE}/api/memory/update?name=${tab}&content=${encodeURIComponent(content)}&session_id=${encodeURIComponent(state.activeSession || 'default')}`, { method: 'POST' });
    const data = await resp.json();
    if (data.status === 'ok') alert('Saved successfully');
  } catch (e) { alert('Save failed: ' + e.message); }
}

// ─── Tasks Panel ────────────────────────────────────────────────
async function loadTasks() {
  try {
    const resp = await fetch(`${API_BASE}/api/tasks`);
    const tasks = await resp.json();
    const container = $('#tasks-list');
    if (tasks.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">No running tasks</p>';
      return;
    }
    container.innerHTML = tasks.map(t => {
      const intervalStr = t.interval >= 60 ? `${Math.round(t.interval/60)}min` : `${t.interval}s`;
      const statusClass = t.running ? 'running' : 'stopped';
      const statusText = t.running ? 'Running' : 'Stopped';
      return `
        <div class="task-item">
          <div>
            <div class="task-name">${escapeHtml(t.name)}</div>
            <div class="task-interval">Interval: ${intervalStr} ${t.description ? '- ' + escapeHtml(t.description) : ''}</div>
          </div>
          <div class="task-status ${statusClass}">${statusText}</div>
        </div>`;
    }).join('');
  } catch (e) { $('#tasks-list').innerHTML = '<p>Load failed</p>'; }
}

// ─── Settings Panel ─────────────────────────────────────────────
function initSettings() {
  $('#btn-set-workdir').addEventListener('click', setWorkDir);
}

async function loadSettings() {
  try {
    const resp = await fetch(`${API_BASE}/api/status`);
    const data = await resp.json();
    $('#setting-model').textContent = data.model || '-';
    if (data.work_dir) $('#workdir-input').value = data.work_dir;
    const tc = $('#tools-list');
    tc.innerHTML = (data.tools || []).map(t =>
      `<div class="tool-badge"><strong>${escapeHtml(t)}</strong></div>`
    ).join('');
  } catch (e) {}
  // Load about info
  try {
    const resp = await fetch(`${API_BASE}/api/about`);
    const about = await resp.json();
    if (about.author) {
      $('#about-author').textContent = about.author;
      $('#about-name').textContent = about.name || 'RaspiClaw';
      $('#about-version').textContent = about.version || '-';
    }
  } catch (e) {}
}

async function setWorkDir() {
  const path = $('#workdir-input').value.trim();
  if (!path) return;
  try {
    const resp = await fetch(`${API_BASE}/api/workdir?session_id=${encodeURIComponent(state.activeSession || 'default')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    const data = await resp.json();
    alert(data.message);
  } catch (e) { alert('Failed: ' + e.message); }
}

// ─── Utilities ──────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatContent(text) {
  if (!text) return '';
  let html = escapeHtml(text);
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  return html;
}

// ─── SSH Remote Connection ─────────────────────────────────────
function initSSH() {
  const btnConnect = $('#btn-ssh-connect');
  const btnDisconnect = $('#btn-ssh-disconnect');
  const btnExec = $('#btn-ssh-exec');
  const cmdInput = $('#ssh-command-input');
  if (!btnConnect) return;

  btnConnect.addEventListener('click', async () => {
    const hostname = $('#ssh-hostname').value.trim();
    const username = $('#ssh-username').value.trim();
    const password = $('#ssh-password').value.trim();
    const port = parseInt($('#ssh-port').value) || 22;
    if (!hostname || !username || !password) {
      sshLog('请填写主机地址、用户名和密码', 'error');
      return;
    }
    sshLog('正在连接 ' + username + '@' + hostname + ':' + port + '...', 'info');
    try {
      const resp = await fetch(API_BASE + '/api/ssh/connect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostname, username, password, port }),
      });
      const data = await resp.json();
      sshLog(data.message, data.status === 'ok' ? 'success' : 'error');
      if (data.status === 'ok') updateSSHState(true);
    } catch (e) {
      sshLog('Connection failed: ' + e.message, 'error');
    }
  });

  btnDisconnect.addEventListener('click', async () => {
    try {
      const resp = await fetch(API_BASE + '/api/ssh/disconnect', { method: 'POST' });
      const data = await resp.json();
      sshLog(data.message, 'info');
      updateSSHState(false);
    } catch (e) {
      sshLog('Disconnect failed: ' + e.message, 'error');
    }
  });

  btnExec.addEventListener('click', execSSHCommand);
  if (cmdInput) cmdInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') execSSHCommand();
  });
}

async function execSSHCommand() {
  const input = $('#ssh-command-input');
  const cmd = input.value.trim();
  if (!cmd) return;
  sshLog('$ ' + cmd, 'cmd');
  input.value = '';
  try {
    const resp = await fetch(API_BASE + '/api/ssh/exec?command=' + encodeURIComponent(cmd), { method: 'POST' });
    const data = await resp.json();
    if (data.status === 'ok') sshLog(data.output, 'output');
    else sshLog(data.message, 'error');
  } catch (e) {
    sshLog('Exec failed: ' + e.message, 'error');
  }
}

function sshLog(msg, type) {
  type = type || 'output';
  const term = document.getElementById('ssh-terminal');
  if (!term) return;
  const time = new Date().toLocaleTimeString();
  var cls = 'ssh-output';
  if (type === 'success') cls = 'ssh-success';
  else if (type === 'error') cls = 'ssh-error';
  else if (type === 'info') cls = 'ssh-info';
  else if (type === 'cmd') cls = 'ssh-cmd';
  term.innerHTML += '<div class="' + cls + '"><span class="ssh-time">[' + time + ']</span> ' + escapeHtml(msg) + '</div>';
  term.scrollTop = term.scrollHeight;
}

function updateSSHState(connected) {
  var cmdInput = $('#ssh-command-input');
  var btnExec = $('#btn-ssh-exec');
  var btnConnect = $('#btn-ssh-connect');
  var btnDisconnect = $('#btn-ssh-disconnect');
  var badge = $('#ssh-status-badge');
  if (cmdInput) cmdInput.disabled = !connected;
  if (btnExec) btnExec.disabled = !connected;
  if (btnConnect) btnConnect.disabled = connected;
  if (btnDisconnect) btnDisconnect.disabled = !connected;
  if (badge) {
    badge.textContent = connected ? '已连接' : '未连接';
    badge.className = connected ? 'motor-status-badge initialized' : 'motor-status-badge';
  }
}
