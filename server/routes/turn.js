const express = require('express');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// Free STUN-only fallback, used if no TURN credentials are configured or the
// TURN provider request fails. Calls on the same network (or simple NATs)
// still work with this; calls across different networks/carriers need TURN.
const STUN_ONLY_FALLBACK = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

let cache = { servers: null, expiresAt: 0 };

router.get('/', requireAuth, async (req, res) => {
  const appName = process.env.METERED_APP_NAME;
  const apiKey = process.env.METERED_API_KEY;

  if (!appName || !apiKey) {
    // Not configured yet — fail soft with STUN-only so calls on the same
    // network keep working while cross-network calls politely fail.
    return res.json({ iceServers: STUN_ONLY_FALLBACK, turnConfigured: false });
  }

  if (cache.servers && Date.now() < cache.expiresAt) {
    return res.json({ iceServers: cache.servers, turnConfigured: true });
  }

  try {
    const url = `https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Metered API returned ${response.status}`);
    const iceServers = await response.json();

    // Metered credentials are time-limited; cache for 4 hours (well under
    // their expiry) so we're not hitting the API on every single call.
    cache = { servers: iceServers, expiresAt: Date.now() + 4 * 60 * 60 * 1000 };
    res.json({ iceServers, turnConfigured: true });
  } catch (err) {
    console.error('Failed to fetch TURN credentials:', err.message, err.cause || '');
    res.json({ iceServers: STUN_ONLY_FALLBACK, turnConfigured: false });
  }
});

module.exports = router;
