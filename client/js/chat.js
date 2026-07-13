// ---- Auth guard ----
const token = localStorage.getItem('whisper_token');
const me = JSON.parse(localStorage.getItem('whisper_user') || 'null');
if (!token || !me) window.location.replace('login.html');

initFogCanvas('fog-canvas');

// ---- Socket connection ----
const socket = io(window.WHISPER_API_URL, { auth: { token } });

let activeConversation = null; // { id, otherUser }
let conversations = [];        // cached list from server
let typingTimeout = null;

const els = {
  convoList: document.getElementById('convo-list'),
  searchInput: document.getElementById('user-search'),
  searchResults: document.getElementById('search-results'),
  emptyState: document.getElementById('empty-state'),
  activeChat: document.getElementById('active-chat'),
  messages: document.getElementById('messages'),
  messageInput: document.getElementById('message-input'),
  sendBtn: document.getElementById('send-btn'),
  headerName: document.getElementById('chat-header-name'),
  headerAvatar: document.getElementById('chat-header-avatar'),
  headerStatus: document.getElementById('chat-header-status'),
  headerStatusText: document.getElementById('chat-header-status-text'),
  typingIndicator: document.getElementById('typing-indicator'),
  typingText: document.getElementById('typing-text'),
  callBtn: document.getElementById('call-btn'),
  backBtn: document.getElementById('back-btn'),
  appShell: document.getElementById('app-shell'),
  profileTrigger: document.getElementById('profile-trigger'),
  profileMenu: document.getElementById('profile-menu'),
  profileAvatar: document.getElementById('profile-avatar'),
  profileName: document.getElementById('profile-name'),
  logoutBtn: document.getElementById('logout-btn')
};

// ---- Profile / logout ----
els.profileAvatar.innerHTML = avatarHTML(me.avatarSeed || 'fox', 'sm');
els.profileName.textContent = me.name || 'You';

els.profileTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  els.profileMenu.classList.toggle('open');
  els.profileTrigger.classList.toggle('open');
});
document.addEventListener('click', () => {
  els.profileMenu.classList.remove('open');
  els.profileTrigger.classList.remove('open');
});

els.logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('whisper_token');
  localStorage.removeItem('whisper_user');
  window.location.replace('login.html');
});

// ---- Mobile back navigation ----
els.backBtn.addEventListener('click', () => {
  els.appShell.classList.remove('chat-open');
});

function timeStr(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function otherParticipant(convo) {
  return convo.participants.find(p => p._id !== me.id && p.id !== me.id) || convo.participants[0];
}

async function loadConversations() {
  conversations = await Api.conversations();
  renderConvoList();
}

function renderConvoList() {
  els.convoList.innerHTML = '';
  conversations.forEach(convo => {
    const other = otherParticipant(convo);
    const div = document.createElement('div');
    div.className = 'convo-item' + (activeConversation?.id === convo._id ? ' active' : '');
    div.innerHTML = `
      ${avatarHTML(other.avatarSeed)}
      <div class="convo-meta">
        <div class="convo-top">
          <span class="name">${other.name}</span>
          <span class="time">${convo.lastMessageAt ? timeStr(convo.lastMessageAt) : ''}</span>
        </div>
        <div class="convo-preview">${convo.lastMessage || 'Say hello…'}</div>
      </div>`;
    div.addEventListener('click', () => openConversation(convo));
    els.convoList.appendChild(div);
  });
}

async function openConversation(convo) {
  activeConversation = { id: convo._id, otherUser: otherParticipant(convo) };
  els.emptyState.style.display = 'none';
  els.activeChat.style.display = 'flex';
  els.appShell.classList.add('chat-open');
  renderConvoList();

  const other = activeConversation.otherUser;
  els.headerName.textContent = other.name;
  els.headerAvatar.innerHTML = avatarHTML(other.avatarSeed, 'sm');
  els.headerStatus.classList.toggle('online', !!other.isOnline);
  els.headerStatusText.textContent = other.isOnline ? 'Active now' : (other.status || 'Offline');

  const history = await Api.messages(convo._id);
  els.messages.innerHTML = '';
  history.forEach(renderMessage);
  scrollToBottom();
}

function renderMessage(msg) {
  const mine = msg.sender === me.id || msg.sender?._id === me.id;
  const row = document.createElement('div');
  row.className = 'msg-row' + (mine ? ' mine' : '');
  row.innerHTML = `<div class="bubble">${escapeHtml(msg.text)}<span class="time">${timeStr(msg.createdAt)}</span></div>`;
  els.messages.appendChild(row);
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function scrollToBottom() {
  els.messages.scrollTop = els.messages.scrollHeight;
}

// ---- Sending messages ----
function sendMessage() {
  const text = els.messageInput.value.trim();
  if (!text || !activeConversation) return;
  socket.emit('message:send', { conversationId: activeConversation.id, text }, (res) => {
    if (res?.error) alert(res.error);
  });
  els.messageInput.value = '';
  els.messageInput.style.height = 'auto';
  socket.emit('typing:stop', { conversationId: activeConversation.id, toUserId: activeConversation.otherUser.id || activeConversation.otherUser._id });
}

els.sendBtn.addEventListener('click', sendMessage);
els.messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
els.messageInput.addEventListener('input', function () {
  this.style.height = 'auto';
  this.style.height = this.scrollHeight + 'px';
  if (!activeConversation) return;
  const otherId = activeConversation.otherUser.id || activeConversation.otherUser._id;
  socket.emit('typing:start', { conversationId: activeConversation.id, toUserId: otherId });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('typing:stop', { conversationId: activeConversation.id, toUserId: otherId });
  }, 1500);
});

// ---- Socket events ----
socket.on('message:new', (msg) => {
  if (activeConversation && msg.conversation === activeConversation.id) {
    renderMessage(msg);
    scrollToBottom();
  }
  loadConversations();
});

socket.on('typing:start', ({ conversationId }) => {
  if (activeConversation && conversationId === activeConversation.id) {
    els.typingText.textContent = `${activeConversation.otherUser.name} is wandering…`;
    els.typingIndicator.style.display = 'flex';
  }
});
socket.on('typing:stop', ({ conversationId }) => {
  if (activeConversation && conversationId === activeConversation.id) {
    els.typingIndicator.style.display = 'none';
  }
});

socket.on('presence:update', ({ userId, isOnline }) => {
  if (activeConversation) {
    const otherId = activeConversation.otherUser.id || activeConversation.otherUser._id;
    if (otherId === userId) {
      els.headerStatus.classList.toggle('online', isOnline);
      els.headerStatusText.textContent = isOnline ? 'Active now' : 'Offline';
    }
  }
  loadConversations();
});

// ---- New conversation / user search ----
let searchTimeout = null;
els.searchInput.addEventListener('input', function () {
  clearTimeout(searchTimeout);
  const q = this.value.trim();
  if (!q) { els.searchResults.style.display = 'none'; return; }
  searchTimeout = setTimeout(async () => {
    const users = await Api.searchUsers(q);
    els.searchResults.innerHTML = '';
    if (users.length === 0) {
      els.searchResults.innerHTML = `<div style="padding:16px; color:var(--text-muted); font-size:13px;">No one found in the woods.</div>`;
    }
    users.forEach(u => {
      const div = document.createElement('div');
      div.className = 'convo-item';
      div.innerHTML = `${avatarHTML(u.avatarSeed)}<div class="convo-meta"><div class="name">${u.name}</div><div class="convo-preview">${u.email}</div></div>`;
      div.addEventListener('click', async () => {
        const convo = await Api.startConversation(u._id);
        els.searchInput.value = '';
        els.searchResults.style.display = 'none';
        await loadConversations();
        const fresh = conversations.find(c => c._id === convo._id) || convo;
        openConversation(fresh);
      });
      els.searchResults.appendChild(div);
    });
    els.searchResults.style.display = 'block';
  }, 300);
});

document.getElementById('new-chat-btn').addEventListener('click', () => {
  els.appShell.classList.remove('chat-open');
  els.searchInput.focus();
});

// ---- Call button wiring (see call.js for WebRTC logic) ----
els.callBtn.addEventListener('click', () => {
  if (!activeConversation) return;
  const other = activeConversation.otherUser;
  startOutgoingCall(other.id || other._id, other.name, other.avatarSeed, activeConversation.id);
});

loadConversations();
