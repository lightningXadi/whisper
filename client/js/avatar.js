// Renders the deterministic forest-creature avatar. seed comes from the
// server (fox/owl/rabbit/deer) — no image assets required.
const CREATURE_EMOJI = { fox: '🦊', owl: '🦉', rabbit: '🐇', deer: '🦌' };

function avatarHTML(seed, size = '') {
  const emoji = CREATURE_EMOJI[seed] || '🦊';
  return `<div class="avatar ${size} avatar-${seed}">${emoji}</div>`;
}
