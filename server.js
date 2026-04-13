'use strict';

require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const expressLayouts = require('express-ejs-layouts');
const fs = require('fs');
const { execSync } = require('child_process');

// Asset version — computed once at startup for cache-busting.
let ASSET_VERSION;
try {
  ASSET_VERSION = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
} catch (e) {
  ASSET_VERSION = Date.now().toString(36);
}

// Document config is static — loaded once at startup
const docConfig = require('./config/documents.json');

// Site config — read fresh each request so branding changes take effect immediately
const siteConfigPath = path.join(__dirname, 'config', 'site.json');
function getSiteConfig() {
  try {
    return JSON.parse(fs.readFileSync(siteConfigPath, 'utf-8'));
  } catch (err) {
    console.error('Failed to read site config:', err);
    return { siteName: 'MSFG Docs', companyName: 'MSFG', favicon: '', logo: {} };
  }
}

const app = express();
const PORT = process.env.PORT || 3004;

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "https://cdnjs.cloudflare.com",
        "https://cdn.jsdelivr.net"
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com"
      ],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://msfg-media.s3.us-west-2.amazonaws.com"],
      frameSrc: ["'self'"],
      connectSrc: ["'self'"]
    }
  },
  frameguard: { action: 'sameorigin' }
}));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

// Middleware
app.use(compression());
app.use(morgan('short'));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Make config available to all templates
app.use((req, res, next) => {
  res.locals.site = getSiteConfig();
  res.locals.documents = docConfig.documents;
  res.locals.categories = docConfig.categories;
  res.locals.currentPath = req.path;
  res.locals.v = ASSET_VERSION;
  res.locals.jsExt = '.js'; // no build step yet
  next();
});

// Static files
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '30d' : 0
}));

// Routes
app.use('/', require('./routes/index'));
app.use('/documents', require('./routes/documents'));
app.use('/workspace', require('./routes/workspace'));
app.use('/report', require('./routes/report'));
app.use('/api', require('./routes/api'));

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).render('404', { title: 'Something went wrong' });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`MSFG Document Creator running at http://localhost:${PORT}`);
  });
}

module.exports = app;
