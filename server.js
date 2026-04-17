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

const { requireAuth, AUTH_ENABLED } = require('./lib/auth/cognito');

// Asset version — computed once at startup for cache-busting.
let ASSET_VERSION;
try {
  ASSET_VERSION = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
} catch (_e) {
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

// BASE_PATH: URL prefix the app is mounted under behind a reverse proxy (e.g. '/docs').
// Must start with '/' and have no trailing slash. Empty string means mounted at root.
let BASE_PATH = String(process.env.BASE_PATH || '').trim();
if (BASE_PATH && !BASE_PATH.startsWith('/')) BASE_PATH = '/' + BASE_PATH;
if (BASE_PATH.endsWith('/')) BASE_PATH = BASE_PATH.slice(0, -1);

// Trust proxy so req.protocol / req.ip reflect the terminating proxy correctly.
app.set('trust proxy', 1);

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
// 50mb limit accommodates the session-report PDF-merge endpoint, which
// receives a JSON array of base64-encoded filled PDFs. Per-route json()
// middleware can still tighten the limit individually.
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false }));

// Make config available to all templates
app.use((req, res, next) => {
  res.locals.site = getSiteConfig();
  res.locals.documents = docConfig.documents;
  res.locals.categories = docConfig.categories;
  // Templates are per-user — the workspace route fetches them with the
  // calling user's Cognito sub. We expose an empty default here so views
  // that read the variable without an explicit override don't crash.
  res.locals.templates = [];
  res.locals.currentPath = req.path;
  res.locals.v = ASSET_VERSION;
  res.locals.jsExt = '.js';
  res.locals.basePath = BASE_PATH;
  /* Optional: UI on another origin than API — origin only. Strip accidental /api suffix. */
  let appOrigin = String(process.env.PUBLIC_APP_ORIGIN || '').trim().replace(/\/$/, '');
  if (appOrigin.endsWith('/api')) appOrigin = appOrigin.slice(0, -4).replace(/\/$/, '');
  res.locals.appOrigin = appOrigin;
  next();
});

/* ---------- Router assembly ---------- */
// Page routes (HTML)
const pageRouter = express.Router();
pageRouter.use('/', require('./routes/index'));
pageRouter.use('/documents', require('./routes/documents'));
pageRouter.use('/workspace', require('./routes/workspace'));
pageRouter.use('/templates', require('./routes/templates'));
pageRouter.use('/dashboard-docs', require('./routes/dashboardDocs'));
pageRouter.use('/report', require('./routes/report'));

// API routes (JSON) — guarded by Cognito auth
const apiRouter = express.Router();
apiRouter.use('/health', require('./routes/health')); // health check is public via publicPaths
apiRouter.use(requireAuth({ publicPaths: ['/health'] }));
apiRouter.use('/email', require('./routes/email'));
apiRouter.use('/pdf', require('./routes/pdf'));
apiRouter.use('/investors', require('./routes/investors'));

// Mount everything under BASE_PATH (empty string = mounted at root)
app.use(BASE_PATH || '/', pageRouter);
app.use(`${BASE_PATH}/api`, apiRouter);

// Static files last so app routes never get ambiguous vs public/
app.use(BASE_PATH || '/', express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '30d' : 0
}));

// 404 handler
app.use((req, res) => {
  // API routes should return JSON 404
  if (req.path.startsWith(`${BASE_PATH}/api/`) || req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.status(404).render('404', { title: 'Page Not Found' });
});

// Global error handler — 4-arg signature required by Express even though _next is unused
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  const status = err.status || 500;
  // API routes should return JSON
  if (req.path.startsWith(`${BASE_PATH}/api/`) || req.path.startsWith('/api/')) {
    return res.status(status).json({ error: err.message || 'Server error' });
  }
  const view = status === 404 ? '404' : '500';
  res.status(status).render(view, { title: status === 404 ? 'Page Not Found' : 'Server Error' });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`MSFG Document Creator running at http://localhost:${PORT}${BASE_PATH || ''}`);
    console.log(`[msfg] Auth: ${AUTH_ENABLED ? 'Cognito enabled' : 'dev mode (no Cognito)'}`);
    console.log('[msfg] Form 4506-C PDF: POST /api/pdf/form-4506-c | investors: GET /api/investors/for-form-4506c');
  });
}

module.exports = app;
