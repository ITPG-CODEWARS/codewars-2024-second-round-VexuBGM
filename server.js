const express = require('express');
const mongoose = require('mongoose');
const shortId = require('shortid');
const ShortURL = require('./models/shortURL');
const QRCode = require('qrcode');
const cron = require('node-cron');
const app = express();

mongoose.connect('mongodb://localhost/urlShortener', {
  serverSelectionTimeoutMS: 5000, // Increase timeout to 5 seconds
  socketTimeoutMS: 45000 // Increase socket timeout to 45 seconds
}).then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error('Error connecting to MongoDB', err);
});

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: false }));

app.get('/', async (req, res) => {
  const shortURLs = await ShortURL.find();
  const shortURLsWithQR = await Promise.all(shortURLs.map(async (shortURL) => {
    const url = `${req.protocol}://${req.get('host')}/${shortURL.short}`;
    const qrCodeURL = await QRCode.toDataURL(url);
    return { ...shortURL.toObject(), qrCodeURL };
  }));
  res.render('index', { shortURLs: shortURLsWithQR });
});

app.post('/shortURLs', async (req, res) => {
  const existingFullURL = await ShortURL.findOne({ full: req.body.fullURL });
  if (existingFullURL) {
    return res.status(400).send('A short URL for this long URL already exists');
  }

  let shortURL;
  if (req.body.customShortURL) {
    shortURL = req.body.customShortURL;
    if (shortURL.length < 5 || shortURL.length > 10) {
      return res.status(400).send('Custom short URL must be between 5 and 10 characters');
    }
    const existingShortURL = await ShortURL.findOne({ short: shortURL });
    if (existingShortURL) {
      return res.status(400).send('Custom short URL already exists');
    }
  } else {
    let urlLength;
    if (req.body.urlLength) {
      urlLength = parseInt(req.body.urlLength, 10);
      if (isNaN(urlLength) || urlLength < 5 || urlLength > 10) {
        return res.status(400).send('URL length must be between 5 and 10 characters');
      }
    } else {
      urlLength = Math.floor(Math.random() * 6) + 5; // Random length between 5 and 10
    }
    shortURL = shortId.generate().slice(0, urlLength);
  }

  const expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
  if (expiresAt) {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set the time to the start of the day
    if (expiresAt < today) {
      return res.status(400).send('Expiration date cannot be in the past');
    }
  }

  const maxUses = req.body.maxUses ? parseInt(req.body.maxUses, 10) : null;
  if (maxUses !== null && (isNaN(maxUses) || maxUses < 1)) {
    return res.status(400).send('Max uses must be a positive number');
  }

  const password = req.body.password || null;

  await ShortURL.create({ full: req.body.fullURL, short: shortURL, expiresAt, maxUses, password });
  res.sendStatus(200);
});

app.delete('/shortURLs/:id', async (req, res) => {
  try {
    const shortURL = await ShortURL.findById(req.params.id);
    if (!shortURL) {
      return res.status(404).send('Short URL not found');
    }

    if (shortURL.password) {
      if (!req.body.password) {
        return res.status(400).send('Password required');
      }
      if (req.body.password !== shortURL.password) {
        return res.status(401).send('Incorrect password');
      }
    }

    await ShortURL.findByIdAndDelete(req.params.id);
    res.sendStatus(200);
  } catch (err) {
    res.status(500).send('Error deleting short URL');
  }
});

app.get('/qrcode/:shortURL', async (req, res) => {
  const shortURL = await ShortURL.findOne({ short: req.params.shortURL });
  if (shortURL == null) return res.sendStatus(404);

  const url = `${req.protocol}://${req.get('host')}/${shortURL.short}`;
  QRCode.toDataURL(url, (err, src) => {
    if (err) res.status(500).send('Error generating QR code');
    res.render('qrcode', { src });
  });
});

app.get('/preview/:shortURL', async (req, res) => {
  const shortURL = await ShortURL.findOne({ short: req.params.shortURL });
  if (shortURL == null) return res.sendStatus(404);

  if (shortURL.expiresAt && shortURL.expiresAt < new Date()) {
    await ShortURL.findByIdAndDelete(shortURL._id);
    return res.status(410).send('This short URL has expired');
  }

  if (shortURL.password) {
    if (!req.query.password) {
      return res.status(401).send('Password required');
    }
    if (req.query.password !== shortURL.password) {
      return res.status(401).send('Incorrect password');
    }
  }

  res.json({ fullURL: shortURL.full });
});

app.get('/:shortURL', async (req, res) => {
  const shortURL = await ShortURL.findOne({ short: req.params.shortURL });
  if (shortURL == null) return res.sendStatus(404);

  if (shortURL.expiresAt && shortURL.expiresAt < new Date()) {
    await ShortURL.findByIdAndDelete(shortURL._id);
    return res.status(410).send('This short URL has expired');
  }

  if (shortURL.password) {
    if (!req.query.password) {
      return res.render('password', { shortURL: req.params.shortURL, error: null });
    }
    if (req.query.password !== shortURL.password) {
      return res.render('password', { shortURL: req.params.shortURL, error: 'Incorrect password' });
    }
  }

  if (shortURL.maxUses !== null) {
    if (shortURL.maxUses <= 1) {
      const fullURL = shortURL.full;
      await ShortURL.findByIdAndDelete(shortURL._id);
      return res.redirect(fullURL);
    }
    shortURL.maxUses--;
  }

  if (shortURL.password) {
    shortURL.clicks+=0.5; // Не ме питайте защо това е най-лесният начин за оправяне, но е така и работи
  }
  else {
    shortURL.clicks++;
  }
  await shortURL.save();

  res.redirect(shortURL.full);
});

// Schedule task to run every day at midnight
cron.schedule('0 0 * * *', async () => {
  const now = new Date();
  await ShortURL.deleteMany({ expiresAt: { $lt: now } });
  console.log('Expired URLs cleaned up');
});

app.listen(process.env.PORT || 5000);