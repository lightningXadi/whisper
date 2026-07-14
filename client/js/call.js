// Audio-only WebRTC calling, signaled over the same Socket.IO connection
// used for chat. Depends on `socket` and `me` being defined in chat.js
// (this file is loaded before chat.js, but functions run after DOM ready
// and socket is attached lazily via window.__whisperSocket).

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

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
  return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
}

function createPeerConnection(peerId) {
  const conn = new RTCPeerConnection(RTC_CONFIG);
  conn.onicecandidate = (e) => {
    if (e.candidate) socket.emit('call:ice-candidate', { toUserId: peerId, candidate: e.candidate });
  };
  conn.ontrack = (e) => {
    remoteAudio.srcObject = e.streams[0];
  };
  conn.onconnectionstatechange = () => {
    if (['disconnected', 'failed', 'closed'].includes(conn.connectionState)) {
      endCall(false);
    }
  };
  return conn;
}

async function startOutgoingCall(peerId, peerName, peerAvatar, conversationId) {
  if (currentCall) return alert('Already in a call.');
  currentCall = { peerId, peerName, peerAvatar, conversationId, isCaller: true };
  showCallOverlay(peerName, peerAvatar, 'Reaching Out', 'Calling…');
  document.getElementById('call-timer').textContent = '';

  localStream = await getMic();
  pc = createPeerConnection(peerId);
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('call:invite', { toUserId: peerId, conversationId, offer });
}

async function acceptIncomingCall() {
  incomingCard.classList.remove('active');
  const { fromUserId, offer, conversationId, fromName, fromAvatar } = window.__incomingCallData;
  currentCall = { peerId: fromUserId, peerName: fromName, peerAvatar: fromAvatar, conversationId, isCaller: false };

  showCallOverlay(fromName, fromAvatar, 'In Communion', 'Echoing…');
  localStream = await getMic();
  pc = createPeerConnection(fromUserId);
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('call:answer', { toUserId: fromUserId, answer });
  startCallTimer();
}

function declineIncomingCall() {
  incomingCard.classList.remove('active');
  const { fromUserId } = window.__incomingCallData || {};
  if (fromUserId) socket.emit('call:decline', { toUserId: fromUserId });
  window.__incomingCallData = null;
}

function endCall(notifyPeer = true) {
  if (notifyPeer && currentCall) socket.emit('call:end', { toUserId: currentCall.peerId });
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

// These socket listeners are attached once chat.js defines `socket`.
window.addEventListener('DOMContentLoaded', () => {
  const wait = setInterval(() => {
    if (typeof socket === 'undefined') return;
    clearInterval(wait);

    socket.on('call:incoming', async ({ fromUserId, conversationId, offer }) => {
      if (currentCall) {
        socket.emit('call:decline', { toUserId: fromUserId });
        return;
      }
      // Look up peer name/avatar from cached conversations if available
      let fromName = 'Someone', fromAvatar = 'fox';
      if (typeof conversations !== 'undefined') {
        const convo = conversations.find(c => c._id === conversationId);
        if (convo) {
          const other = convo.participants.find(p => (p._id || p.id) === fromUserId);
          if (other) { fromName = other.name; fromAvatar = other.avatarSeed; }
        }
      }
      window.__incomingCallData = { fromUserId, offer, conversationId, fromName, fromAvatar };
      document.getElementById('incoming-call-name').textContent = fromName;
      document.getElementById('incoming-call-avatar').innerHTML = avatarHTML(fromAvatar, 'sm');
      incomingCard.classList.add('active');
    });

    socket.on('call:answered', async ({ answer }) => {
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      showCallOverlay(currentCall.peerName, currentCall.peerAvatar, 'In Communion', 'Echoing…');
      startCallTimer();
    });

    socket.on('call:ice-candidate', async ({ candidate }) => {
      if (pc && candidate) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { console.warn(e); }
      }
    });

    socket.on('call:declined', () => {
      alert('They are not able to talk right now.');
      endCall(false);
    });

    socket.on('call:ended', () => {
      endCall(false);
    });
  }, 50);
});
