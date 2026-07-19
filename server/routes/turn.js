const express = require('express');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// Free STUN-only fallback, used only if TURN credentials aren't configured.
const STUN_ONLY_FALLBACK = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

router.get('/', requireAuth, (req, res) => {
  const turnUrl = process.env.EXPRESSTURN_URL;
  const username = process.env.EXPRESSTURN_USERNAME;
  const credential = process.env.EXPRESSTURN_PASSWORD;

  if (!turnUrl || !username || !credential) {
    return res.json({ iceServers: STUN_ONLY_FALLBACK, turnConfigured: false });
  }

  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: `turn:${turnUrl}`, username, credential }
  ];

  res.json({ iceServers, turnConfigured: true });
});

module.exports = router;
