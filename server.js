const express = require('express');
const mongoose = require('mongoose');
const shortId = require('shortid');
const ShortURL = require('./models/shortURL');
const QRCode = require('qrcode');
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

  await ShortURL.create({ full: req.body.fullURL, short: shortURL });
  res.sendStatus(200);
});

app.delete('/shortURLs/:id', async (req, res) => {
  try {
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

app.get('/:shortURL', async (req, res) => {
  const shortURL = await ShortURL.findOne({ short: req.params.shortURL });
  if (shortURL == null) return res.sendStatus(404);

  shortURL.clicks++;
  shortURL.save();

  res.redirect(shortURL.full);
});

app.listen(process.env.PORT || 5000);