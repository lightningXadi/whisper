// Deterministic "forest creature" avatar — no images needed, just a stable
// seed used client-side to render an emoji + gradient combo per user.
const CREATURES = ['fox', 'owl', 'rabbit', 'deer'];

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seedFor(email) {
  const h = hashString(email);
  return CREATURES[h % CREATURES.length];
}

module.exports = { seedFor };
