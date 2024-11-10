const express = require('express');
const mongoose = require('mongoose');
const shortId = require('shortid');
const ShortURL = require('./models/shortURL');
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
  res.render('index', { shortURLs: shortURLs });
});

app.post('/shortURLs', async (req, res) => {
  let shortURL;
  if (req.body.customShortURL) {
    shortURL = req.body.customShortURL;
    if (shortURL.length < 5 || shortURL.length > 10) {
      return res.status(400).send('Custom short URL must be between 5 and 10 characters');
    }
    const existingURL = await ShortURL.findOne({ short: shortURL });
    if (existingURL) {
      return res.status(400).send('Custom short URL already exists');
    }
  } else {
    shortURL = shortId.generate();
  }

  await ShortURL.create({ full: req.body.fullURL, short: shortURL });
  res.sendStatus(200);
});

app.get('/:shortURL', async (req, res) => {
  const shortURL = await ShortURL.findOne({ short: req.params.shortURL })
  if (shortURL == null) return res.sendStatus(404);

  shortURL.clicks++;
  shortURL.save();

  res.redirect(shortURL.full);
});

app.listen(process.env.PORT || 5000);