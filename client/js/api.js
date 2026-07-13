// Central place for API base URL + fetch helpers.
// Set window.WHISPER_API_URL before this loads (see config.js) or defaults to localhost.
const API_BASE = window.WHISPER_API_URL || 'http://localhost:5000';

function authHeaders() {
  const token = localStorage.getItem('whisper_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiRequest(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const Api = {
  signup: (name, email, password) => apiRequest('/api/auth/signup', { method: 'POST', body: { name, email, password } }),
  login: (email, password) => apiRequest('/api/auth/login', { method: 'POST', body: { email, password } }),
  google: (credential) => apiRequest('/api/auth/google', { method: 'POST', body: { credential } }),
  me: () => apiRequest('/api/users/me'),
  searchUsers: (q) => apiRequest(`/api/users?q=${encodeURIComponent(q || '')}`),
  conversations: () => apiRequest('/api/conversations'),
  startConversation: (otherUserId) => apiRequest('/api/conversations', { method: 'POST', body: { otherUserId } }),
  messages: (conversationId) => apiRequest(`/api/conversations/${conversationId}/messages`)
};
