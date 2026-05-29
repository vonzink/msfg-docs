'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const rateLimit = require('express-rate-limit');

const configPath = path.join(__dirname, '..', 'config', 'site.json');
const imagesDir = path.join(__dirname, '..', 'public', 'images');

// --- Helpers ---

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (err) {
    console.error('Failed to read site config:', err);
    return null;
  }
}

function writeConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return true;
  } catch (err) {
    console.error('Failed to write site config:', err);
    return false;
  }
}

// All redirects must respect the BASE_PATH the app is mounted under
// (e.g. '/docs' behind the reverse proxy). res.locals.basePath is set
// globally in server.js.
function settingsUrl(res, suffix) {
  return (res.locals.basePath || '') + '/settings' + (suffix || '');
}

// --- Auth: token-based session (POST login, no URL passwords) ---

const validTokens = new Set();

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Login form — must be registered BEFORE requireAuth middleware
router.get('/login', (req, res) => {
  const password = process.env.SETTINGS_PASSWORD;
  if (!password) return res.redirect(settingsUrl(res));
  res.render('settings-login', { title: 'Settings Login', error: false });
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15-minute window
  max: 10,                    // 10 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts. Please try again in 15 minutes.'
});

router.post('/login', loginLimiter, (req, res) => {
  const password = process.env.SETTINGS_PASSWORD;
  if (!password) return res.redirect(settingsUrl(res));

  const input = String(req.body.password || '');
  const inputBuf = Buffer.from(input);
  const passBuf = Buffer.from(password);

  // Timing-safe comparison (must be same length for timingSafeEqual)
  const match = inputBuf.length === passBuf.length &&
    crypto.timingSafeEqual(inputBuf, passBuf);

  if (match) {
    const token = generateToken();
    validTokens.add(token);
    res.cookie('settingsAuth', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000
    });
    return res.redirect(settingsUrl(res));
  }

  res.render('settings-login', { title: 'Settings Login', error: true });
});

// Auth middleware — everything below requires auth
function requireAuth(req, res, next) {
  const password = process.env.SETTINGS_PASSWORD;
  if (!password) return next();

  const token = req.cookies?.settingsAuth;
  if (token && validTokens.has(token)) return next();

  // Redirect GET requests to login page, deny others
  if (req.method === 'GET') return res.redirect(settingsUrl(res, '/login'));
  res.status(403).render('404', { title: 'Access Denied' });
}

router.use(requireAuth);

// --- CSRF protection (double-submit cookie) ---

router.use((req, res, next) => {
  if (req.method === 'GET') {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie('_csrf', token, { httpOnly: true, sameSite: 'strict' });
    res.locals.csrfToken = token;
  }
  next();
});

router.use((req, res, next) => {
  if (req.method !== 'POST') return next();
  // Multipart uploads — CSRF checked after multer parses the body
  if (req.path === '/logo' || req.path === '/signature') return next();

  const cookieToken = req.cookies?._csrf;
  const bodyToken = req.body?._csrf;

  if (!cookieToken || !bodyToken || cookieToken !== bodyToken) {
    return res.status(403).render('404', { title: 'Invalid Request' });
  }
  next();
});

// --- File upload config ---

const upload = multer({
  dest: imagesDir,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // No SVG — it can contain embedded JavaScript (XSS vector)
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  }
});

const ALLOWED_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];

// Shared handler for the deferred-CSRF image uploads (logo, signature).
// Validates the CSRF token (multer had to parse the body first), checks the
// extension, moves the temp file to a fixed name, then runs `apply` to record
// it in the config.
function handleImageUpload(req, res, fixedName, apply) {
  const cookieToken = req.cookies?._csrf;
  const bodyToken = req.body?._csrf;
  if (!cookieToken || !bodyToken || cookieToken !== bodyToken) {
    if (req.file) try { fs.unlinkSync(req.file.path); } catch (_e) { /* ignore */ }
    return res.status(403).render('404', { title: 'Invalid Request' });
  }

  if (!req.file) return res.redirect(settingsUrl(res, '?saved=0'));

  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!ALLOWED_EXTS.includes(ext)) {
    try { fs.unlinkSync(req.file.path); } catch (_e) { /* ignore */ }
    return res.redirect(settingsUrl(res, '?saved=0'));
  }

  const newPath = path.join(imagesDir, fixedName);
  try {
    fs.renameSync(req.file.path, newPath);
  } catch (err) {
    console.error('Failed to move uploaded image:', err);
    return res.redirect(settingsUrl(res, '?saved=0'));
  }

  const config = readConfig();
  if (!config) return res.redirect(settingsUrl(res, '?saved=0'));
  apply(config, '/images/' + fixedName);
  writeConfig(config);

  res.redirect(settingsUrl(res, '?saved=1'));
}

// --- Routes ---

router.get('/', (req, res) => {
  const config = readConfig();
  if (!config) return res.status(500).render('500', { title: 'Configuration Error' });

  res.render('settings', {
    title: 'Site Settings',
    config,
    extraScripts: `<script src="${res.locals.basePath || ''}/js/settings${res.locals.jsExt}?v=${res.locals.v}"></script>`,
    saved: req.query.saved === '1'
  });
});

// --- Logo Upload ---
router.post('/logo', upload.single('logo'), (req, res) => {
  handleImageUpload(req, res, 'msfg-logo.png', (config, src) => {
    if (!config.logo) config.logo = {};
    config.logo.src = src;
  });
});

// --- Signature Upload ---
router.post('/signature', upload.single('signature'), (req, res) => {
  handleImageUpload(req, res, 'signature.png', (config, src) => {
    config.signature = src;
  });
});

// --- Branding / Site Configuration ---
router.post('/update', (req, res) => {
  const config = readConfig();
  if (!config) return res.redirect(settingsUrl(res, '?saved=0'));

  if (req.body.siteName && typeof req.body.siteName === 'string') {
    config.siteName = req.body.siteName.trim().slice(0, 100);
  }
  if (req.body.companyName && typeof req.body.companyName === 'string') {
    config.companyName = req.body.companyName.trim().slice(0, 100);
  }
  if (req.body.logoWidth) {
    const width = parseInt(req.body.logoWidth, 10);
    if (!config.logo) config.logo = {};
    config.logo.width = (width > 0 && width <= 500) ? width : 250;
  }

  writeConfig(config);
  res.redirect(settingsUrl(res, '?saved=1'));
});

// --- Email Signature ---
router.post('/email-signature', (req, res) => {
  const config = readConfig();
  if (!config) return res.redirect(settingsUrl(res, '?saved=0'));

  if (!config.emailSignature) {
    config.emailSignature = { name: '', title: '', phone: '', email: '', nmls: '', company: '' };
  }

  const fields = ['name', 'title', 'phone', 'email', 'nmls', 'company'];
  fields.forEach(field => {
    if (typeof req.body['sig_' + field] === 'string') {
      config.emailSignature[field] = req.body['sig_' + field].trim().slice(0, 200);
    }
  });

  writeConfig(config);
  res.redirect(settingsUrl(res, '?saved=1'));
});

// --- SMTP Configuration ---
router.post('/smtp', (req, res) => {
  const config = readConfig();
  if (!config) return res.redirect(settingsUrl(res, '?saved=0'));

  if (!config.smtp) {
    config.smtp = { host: '', port: '587', user: '', pass: '', from: '' };
  }

  const port = (req.body.smtp_port || '587').toString().trim().slice(0, 5);
  config.smtp.host = (req.body.smtp_host || '').trim().slice(0, 200);
  config.smtp.port = port;
  config.smtp.secure = port === '465';
  config.smtp.user = (req.body.smtp_user || '').trim().slice(0, 200);
  /* Only update password if a new one was provided (not the masked value) */
  const pass = (req.body.smtp_pass || '').trim().slice(0, 200);
  if (pass && !pass.includes('••')) {
    config.smtp.pass = pass;
  }
  config.smtp.from = (req.body.smtp_from || '').trim().slice(0, 200);

  writeConfig(config);
  res.redirect(settingsUrl(res, '?saved=1'));
});

module.exports = router;
