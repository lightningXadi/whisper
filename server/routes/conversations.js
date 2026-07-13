const express = require('express');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// List conversations for the logged-in user
router.get('/', requireAuth, async (req, res) => {
  const convos = await Conversation.find({ participants: req.userId })
    .populate('participants', 'name email avatarSeed isOnline status')
    .sort({ lastMessageAt: -1 });
  res.json(convos);
});

// Start or fetch an existing 1:1 conversation with another user
router.post('/', requireAuth, async (req, res) => {
  const { otherUserId } = req.body;
  if (!otherUserId) return res.status(400).json({ error: 'otherUserId is required.' });

  let convo = await Conversation.findOne({
    participants: { $all: [req.userId, otherUserId], $size: 2 }
  });
  if (!convo) {
    convo = await Conversation.create({ participants: [req.userId, otherUserId] });
  }
  convo = await convo.populate('participants', 'name email avatarSeed isOnline status');
  res.json(convo);
});

// Message history for a conversation
router.get('/:id/messages', requireAuth, async (req, res) => {
  const convo = await Conversation.findById(req.params.id);
  if (!convo || !convo.participants.some(p => p.toString() === req.userId)) {
    return res.status(403).json({ error: 'Not part of this conversation.' });
  }
  const messages = await Message.find({ conversation: req.params.id })
    .sort({ createdAt: 1 })
    .limit(200);
  res.json(messages);
});

module.exports = router;
