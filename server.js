require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json());
app.use(express.static('public'));

mongoose.connect(process.env.MONGO_URI).then(() => console.log('DB connected'));

const User = mongoose.model('User', { username: String, password: String });
const Status = mongoose.model('Status', {
  place: String,
  level: String, // empty | moderate | crowded
  waitMin: Number,
  createdAt: { type: Date, default: Date.now },
});

// Create the receptionist account once: open /api/setup in the browser, then delete this route
app.get('/api/setup', async (req, res) => {
  if (await User.findOne({ username: 'reception' })) return res.send('already exists');
  await User.create({ username: 'reception', password: await bcrypt.hash('canteen123', 10) });
  res.send('created');
});

app.post('/api/login', async (req, res) => {
  const u = await User.findOne({ username: req.body.username });
  if (!u || !(await bcrypt.compare(req.body.password, u.password)))
    return res.status(401).json({ error: 'Invalid login' });
  res.json({ token: jwt.sign({ id: u._id }, process.env.JWT_SECRET, { expiresIn: '12h' }) });
});

function auth(req, res, next) {
  try {
    jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Unauthorized' }); }
}

// Receptionist updates status
app.post('/api/status', auth, async (req, res) => {
  const { place, level, waitMin } = req.body;
  await Status.create({ place, level, waitMin });
  res.json({ ok: true });
});

// Public: latest status for a place
app.get('/api/status/:place', async (req, res) => {
  const s = await Status.findOne({ place: req.params.place }).sort({ createdAt: -1 });
  if (!s) return res.json({ level: 'unknown', isStale: true });
  const minutesAgo = Math.round((Date.now() - s.createdAt) / 60000);
  res.json({ level: s.level, waitMin: s.waitMin, minutesAgo, isStale: minutesAgo > 20 });
});

app.listen(process.env.PORT || 3000, () => console.log('Running'));