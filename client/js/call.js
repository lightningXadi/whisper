// Guard against this script being loaded twice (e.g. a leftover duplicate
// <script> tag from a manual file merge) — an IIFE keeps all the const/let/
// function declarations safely scoped, so a second load just no-ops instead
// of throwing a redeclaration error.
(function () {
  if (window.__whisperCallLoaded) {
    console.warn('call.js loaded twice — skipping duplicate execution.');
    return;
  }
  window.__whisperCallLoaded = true;

// Audio-only WebRTC calling, signaled over the same Socket.IO connection
// used for chat. Reads `window.socket` (set by chat.js) directly instead of
// polling — avoids cross-script timing issues entirely.

// STUN-only default — works when both sides are on simple/same networks.
// Calls across different networks (home WiFi <-> mobile data, two different
// WiFis, carrier-grade NAT) need a TURN relay too; that's fetched fresh from
// our own backend below (/api/turn-credentials) rather than hardcoded here,
// since free TURN providers rotate/expire their credentials.
let RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 4
};

async function refreshRtcConfig() {
  try {
    const base = window.WHISPER_API_URL || '';
    const token = localStorage.getItem('whisper_token') || localStorage.getItem('token');
    const res = await fetch(`${base}/api/turn-credentials`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.iceServers) && data.iceServers.length) {
      RTC_CONFIG = { iceServers: data.iceServers, iceCandidatePoolSize: 4 };
    }
    if (!data.turnConfigured) {
      console.warn('No TURN server configured on the backend yet — calls will only work when both sides are on friendly/same networks. See README for setup.');
    }
  } catch (err) {
    console.warn('Could not fetch TURN credentials, falling back to STUN-only:', err.message);
  }
}
// Fetch once at load, and again right before each outgoing/incoming call
// picks up the peer connection, so credentials never go stale mid-session.
refreshRtcConfig();

let pc = null;
let localStream = null;
let callTimerInterval = null;
let callSeconds = 0;
let currentCall = null; // { peerId, peerName, peerAvatar, conversationId, isCaller }

const callOverlay = document.getElementById('call-overlay');
const incomingCard = document.getElementById('incoming-call-card');
const remoteAudio = document.getElementById('remote-audio');

function fmtTime(s) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

function startCallTimer() {
  callSeconds = 0;
  document.getElementById('call-timer').textContent = fmtTime(0);
  callTimerInterval = setInterval(() => {
    callSeconds++;
    document.getElementById('call-timer').textContent = fmtTime(callSeconds);
  }, 1000);
}
function stopCallTimer() {
  clearInterval(callTimerInterval);
}

function showCallOverlay(peerName, peerAvatar, statusLabel, badgeText) {
  document.getElementById('call-peer-name').textContent = peerName;
  document.getElementById('call-avatar').innerHTML = avatarHTML(peerAvatar, 'lg');
  document.getElementById('call-status-label').textContent = statusLabel;
  document.getElementById('call-badge').textContent = badgeText;
  callOverlay.classList.add('active');
}
function hideCallOverlay() {
  callOverlay.classList.remove('active');
  stopCallTimer();
}

async function getMic() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('This browser does not support microphone access (getUserMedia unavailable). Try a modern Chrome/Firefox/Safari and make sure the site is loaded over HTTPS.');
  }
  return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
}

function createPeerConnection(peerId) {
  const conn = new RTCPeerConnection(RTC_CONFIG);
  conn.onicecandidate = (e) => {
    if (e.candidate) window.socket.emit('call:ice-candidate', { toUserId: peerId, candidate: e.candidate });
  };
  conn.ontrack = (e) => {
    console.log('Remote audio track received.');
    remoteAudio.srcObject = e.streams[0];
  };
  conn.oniceconnectionstatechange = () => {
    console.log('ICE connection state:', conn.iceConnectionState);
  };
  conn.onicegatheringstatechange = () => {
    console.log('ICE gathering state:', conn.iceGatheringState);
  };
  conn.onconnectionstatechange = () => {
    console.log('Call connection state:', conn.connectionState);
    if (['disconnected', 'failed', 'closed'].includes(conn.connectionState)) {
      endCall(false);
    }
  };
  return conn;
}

async function startOutgoingCall(peerId, peerName, peerAvatar, conversationId) {
  if (!window.socket || !window.socket.connected) {
    alert('Not connected to the server yet — please wait a moment and try again.');
    return;
  }
  if (currentCall) return alert('Already in a call.');

  try {
    currentCall = { peerId, peerName, peerAvatar, conversationId, isCaller: true };
    showCallOverlay(peerName, peerAvatar, 'Reaching Out', 'Calling…');
    document.getElementById('call-timer').textContent = '';

    await refreshRtcConfig();
    localStream = await getMic();
    pc = createPeerConnection(peerId);
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    window.socket.emit('call:invite', { toUserId: peerId, conversationId, offer });
  } catch (err) {
    console.error('Failed to start call:', err);
    alert(err.message.includes('Permission') || err.name === 'NotAllowedError'
      ? 'Microphone access was blocked. Please allow microphone permission for this site and try again.'
      : `Could not start the call: ${err.message}`);
    currentCall = null;
    hideCallOverlay();
  }
}

async function acceptIncomingCall() {
  incomingCard.classList.remove('active');
  const { fromUserId, offer, conversationId, fromName, fromAvatar } = window.__incomingCallData;
  currentCall = { peerId: fromUserId, peerName: fromName, peerAvatar: fromAvatar, conversationId, isCaller: false };

  try {
    showCallOverlay(fromName, fromAvatar, 'In Communion', 'Echoing…');
    await refreshRtcConfig();
    localStream = await getMic();
    pc = createPeerConnection(fromUserId);
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    window.socket.emit('call:answer', { toUserId: fromUserId, answer });
    startCallTimer();
  } catch (err) {
    console.error('Failed to accept call:', err);
    alert('Could not join the call: ' + err.message);
    endCall(true);
  }
}

function declineIncomingCall() {
  incomingCard.classList.remove('active');
  const { fromUserId } = window.__incomingCallData || {};
  if (fromUserId && window.socket) window.socket.emit('call:decline', { toUserId: fromUserId });
  window.__incomingCallData = null;
}

function endCall(notifyPeer = true) {
  if (notifyPeer && currentCall && window.socket) window.socket.emit('call:end', { toUserId: currentCall.peerId });
  if (pc) { pc.close(); pc = null; }
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  remoteAudio.srcObject = null;
  currentCall = null;
  hideCallOverlay();
}

document.getElementById('end-call-btn').addEventListener('click', () => endCall(true));

let muted = false;
document.getElementById('mute-btn').addEventListener('click', function () {
  if (!localStream) return;
  muted = !muted;
  localStream.getAudioTracks().forEach(t => t.enabled = !muted);
  this.querySelector('.circle').style.color = muted ? 'var(--danger)' : '';
  this.querySelector('.label').textContent = muted ? 'Unmute' : 'Mute';
});

document.getElementById('speaker-btn').addEventListener('click', function () {
  // Browser-level speaker routing is limited on web; this is a soft toggle
  // that mutes/unmutes the remote audio element as a simple stand-in.
  remoteAudio.muted = !remoteAudio.muted;
  this.querySelector('.label').textContent = remoteAudio.muted ? 'Unmute Out' : 'Speaker';
});

document.getElementById('icc-accept').addEventListener('click', acceptIncomingCall);
document.getElementById('icc-decline').addEventListener('click', declineIncomingCall);

// Wire up socket listeners as soon as window.socket exists. chat.js sets
// window.socket synchronously right when it loads (script tag right after
// this one), so this resolves almost immediately — but we still poll
// window.socket (a plain property, no TDZ risk) as a safety net.
function attachCallSocketListeners() {
  const s = window.socket;

  s.on('call:incoming', async ({ fromUserId, conversationId, offer }) => {
    if (currentCall) {
      s.emit('call:decline', { toUserId: fromUserId });
      return;
    }
    let fromName = 'Someone', fromAvatar = 'fox';
    const convoList = window.conversations || [];
    const convo = convoList.find(c => c._id === conversationId);
    if (convo) {
      const other = convo.participants.find(p => (p._id || p.id) === fromUserId);
      if (other) { fromName = other.name; fromAvatar = other.avatarSeed; }
    }
    window.__incomingCallData = { fromUserId, offer, conversationId, fromName, fromAvatar };
    document.getElementById('incoming-call-name').textContent = fromName;
    document.getElementById('incoming-call-avatar').innerHTML = avatarHTML(fromAvatar, 'sm');
    incomingCard.classList.add('active');
  });

  s.on('call:answered', async ({ answer }) => {
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
    showCallOverlay(currentCall.peerName, currentCall.peerAvatar, 'In Communion', 'Echoing…');
    startCallTimer();
  });

  s.on('call:ice-candidate', async ({ candidate }) => {
    if (pc && candidate) {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { console.warn(e); }
    }
  });

  s.on('call:declined', () => {
    alert('They are not able to talk right now.');
    endCall(false);
  });

  s.on('call:ended', () => {
    endCall(false);
  });

  console.log('Call signaling listeners attached.');
}

(function waitForSocket() {
  if (window.socket) {
    attachCallSocketListeners();
  } else {
    const check = setInterval(() => {
      if (window.socket) {
        clearInterval(check);
        attachCallSocketListeners();
      }
    }, 30);
  }
})();

window.startOutgoingCall = startOutgoingCall;

})();
