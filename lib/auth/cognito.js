'use strict';

/**
 * Cognito JWT verification middleware.
 * Verifies RS256 JWTs against the User Pool JWKS endpoint, populates req.user,
 * and returns 401 for missing/invalid tokens on guarded routes.
 *
 * Env:
 *   COGNITO_REGION       (default us-west-1)
 *   COGNITO_USER_POOL_ID
 *   COGNITO_CLIENT_ID    (optional; verified manually — Cognito access tokens use client_id, not aud)
 *   COGNITO_ISSUER       (optional override)
 *
 * When COGNITO_USER_POOL_ID is unset, the middleware is a no-op pass-through and attaches
 * a dev-mode mock user. This keeps local development working without an AWS config.
 */

const { createRemoteJWKSet, jwtVerify } = require('jose');

const REGION = process.env.COGNITO_REGION || 'us-west-1';
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || process.env.USER_POOL_ID || '';
const CLIENT_ID = process.env.COGNITO_CLIENT_ID || process.env.APP_CLIENT_ID || '';
const ISSUER = process.env.COGNITO_ISSUER ||
  (USER_POOL_ID ? `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}` : '');

const AUTH_ENABLED = Boolean(USER_POOL_ID);
const JWKS = AUTH_ENABLED ? createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`)) : null;

function parseCookies(req) {
  if (req.cookies) return req.cookies; // cookie-parser already ran
  const header = req.headers?.cookie;
  if (!header) return {};
  return header.split(';').reduce((acc, part) => {
    const [k, ...rest] = part.trim().split('=');
    if (!k) return acc;
    acc[k] = decodeURIComponent(rest.join('=') || '');
    return acc;
  }, {});
}

function extractToken(req) {
  const auth = req.headers?.authorization || req.headers?.Authorization;
  if (auth && typeof auth === 'string') {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  const cookies = parseCookies(req);
  if (cookies.auth_token) return cookies.auth_token;
  return null;
}

async function verifyCognitoJwt(token) {
  if (!AUTH_ENABLED) throw new Error('Cognito auth not configured');

  const { payload } = await jwtVerify(token, JWKS, {
    issuer: ISSUER,
    clockTolerance: 30
  });

  if (CLIENT_ID) {
    const aud = payload.aud;
    const clientId = payload.client_id;
    if (aud && aud !== CLIENT_ID && clientId !== CLIENT_ID) {
      throw new Error('Token client mismatch');
    }
  }

  return payload;
}

function buildReqUser(claims) {
  const groups = claims['cognito:groups'] || claims.groups || [];
  return {
    sub: claims.sub,
    username: claims.username || claims['cognito:username'],
    email: claims.email,
    groups: Array.isArray(groups) ? groups : [],
    claims
  };
}

/**
 * requireAuth({ publicPaths: [] })
 * Returns 401 when token is missing/invalid.
 * In dev mode (no USER_POOL_ID), attaches a mock user and passes through.
 */
function requireAuth(options = {}) {
  const publicPaths = Array.isArray(options.publicPaths) ? options.publicPaths : [];

  return async function authMiddleware(req, res, next) {
    if (publicPaths.some((p) => req.path === p || req.originalUrl?.startsWith(p))) {
      return next();
    }

    if (!AUTH_ENABLED) {
      req.user = { sub: 'dev', username: 'dev', email: 'dev@local', groups: [], claims: {}, dev: true };
      return next();
    }

    const token = extractToken(req);
    if (!token) return res.status(401).json({ error: 'Missing auth token' });

    try {
      const claims = await verifyCognitoJwt(token);
      req.user = buildReqUser(claims);
      return next();
    } catch (err) {
      console.warn('[auth] Token verification failed:', err?.message || err);
      return res.status(401).json({ error: 'Unauthorized' });
    }
  };
}

function requireAnyGroup(...allowedGroups) {
  const allowed = allowedGroups.flat().filter(Boolean);
  return function groupMiddleware(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (allowed.length === 0) return next();
    const groups = req.user.groups || [];
    if (!allowed.some((g) => groups.includes(g))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
  };
}

module.exports = {
  requireAuth,
  requireAnyGroup,
  extractToken,
  verifyCognitoJwt,
  AUTH_ENABLED
};
