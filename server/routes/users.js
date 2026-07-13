const express = require('express');
const User = require('../models/User');
const requireAuth = require('../middleware/auth');

const router = express.Router();

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({
    id: user._id, name: user.name, email: user.email,
    avatarSeed: user.avatarSeed, status: user.status
  });
});

// Search/list other users to start a new conversation with
router.get('/', requireAuth, async (req, res) => {
  const q = (req.query.q || '').trim();
  const filter = { _id: { $ne: req.userId } };
  if (q) filter.$or = [
    { name: new RegExp(q, 'i') },
    { email: new RegExp(q, 'i') }
  ];
  const users = await User.find(filter).limit(20)
    .select('name email avatarSeed isOnline status');
  res.json(users);
});

module.exports = router;
