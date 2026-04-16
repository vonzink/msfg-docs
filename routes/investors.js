'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { getPool, isMysqlConfigured } = require('../lib/mysqlPool');
const { investorListLabel, mapRowToFormFields } = require('../services/investors/form4506cMapper');
const { ssaListLabel, mapRowToFormFields: mapRowToSsaFields } = require('../services/investors/ssa89Mapper');
const { sanitizeMysqlIdent, computeLoanMatches } = require('../services/investors/loanMatch');

const router = express.Router();

const table = () => {
  const cleaned = String(process.env.MYSQL_INVESTORS_TABLE || 'investors').replace(/[^a-zA-Z0-9_]/g, '');
  return cleaned || 'investors';
};

const listLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests.' }
});

router.get('/for-form-4506c', listLimiter, async (req, res) => {
  if (!isMysqlConfigured()) {
    return res.json({
      success: true,
      configured: false,
      investors: [],
      matchedIds: [],
      autoSelectId: null,
      matchHint: '',
      message: 'MySQL is not configured. Set MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, and MYSQL_DATABASE in .env.'
    });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ success: false, investors: [], message: 'Database pool unavailable.' });
  }

  try {
    const t = table();
    const loanCol = sanitizeMysqlIdent(process.env.MYSQL_INVESTORS_LOAN_COLUMN || '');
    const extraLoanSelect = loanCol ? `, \`${loanCol}\` AS _loan_match_val` : '';

    const [rows] = await pool.query(
      `SELECT id, doc_4506c, doc_mailing_address, doc_ssa, doc_other${extraLoanSelect} FROM \`${t}\` ORDER BY id ASC`
    );

    const investors = (rows || []).map((row) => ({
      id: row.id,
      label: investorListLabel(row)
    }));

    const loan = String(req.query.loan || '').trim();
    const { matchedIds, autoSelectId } = computeLoanMatches(rows || [], loan);

    let matchHint = '';
    if (loan) {
      if (matchedIds.length === 1) matchHint = 'Matched one investor for this loan number.';
      else if (matchedIds.length > 1) matchHint = 'Multiple investors match this loan — choose one below.';
      else matchHint = 'No investor row matched this loan — pick manually or set MYSQL_INVESTORS_LOAN_COLUMN / JSON matchingLoanNumbers in doc_4506c.';
    }

    res.json({
      success: true,
      configured: true,
      investors,
      loan: loan || null,
      matchedIds,
      autoSelectId,
      matchHint: loan ? matchHint : ''
    });
  } catch (err) {
    console.error('[Investors] list for-form-4506c', err.message);
    res.status(500).json({
      success: false,
      investors: [],
      message: 'Could not load investors. Check MySQL credentials and that doc_* columns exist.'
    });
  }
});

router.get('/:id/form-4506c-fields', listLimiter, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'Invalid investor id.' });
  }

  if (!isMysqlConfigured()) {
    return res.status(503).json({ success: false, message: 'MySQL is not configured.' });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ success: false, message: 'Database pool unavailable.' });
  }

  try {
    const t = table();
    const [rows] = await pool.query(
      `SELECT id, doc_4506c, doc_mailing_address, doc_ssa, doc_other FROM \`${t}\` WHERE id = ? LIMIT 1`,
      [id]
    );
    const row = rows && rows[0];
    if (!row) {
      return res.status(404).json({ success: false, message: 'Investor not found.' });
    }

    const fields = mapRowToFormFields(row);
    res.json({ success: true, id: row.id, fields });
  } catch (err) {
    console.error('[Investors] form-4506c-fields', err.message);
    res.status(500).json({ success: false, message: 'Could not load investor row.' });
  }
});

/* ---- SSA-89 endpoints ---- */

router.get('/for-ssa-89', listLimiter, async (req, res) => {
  if (!isMysqlConfigured()) {
    return res.json({
      success: true,
      configured: false,
      investors: [],
      matchedIds: [],
      autoSelectId: null,
      matchHint: '',
      message: 'MySQL is not configured. Set MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, and MYSQL_DATABASE in .env.'
    });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ success: false, investors: [], message: 'Database pool unavailable.' });
  }

  try {
    const t = table();
    const loanCol = sanitizeMysqlIdent(process.env.MYSQL_INVESTORS_LOAN_COLUMN || '');
    const extraLoanSelect = loanCol ? `, \`${loanCol}\` AS _loan_match_val` : '';

    const [rows] = await pool.query(
      `SELECT id, doc_4506c, doc_mailing_address, doc_ssa, doc_other${extraLoanSelect} FROM \`${t}\` ORDER BY id ASC`
    );

    const investors = (rows || []).map((row) => ({
      id: row.id,
      label: ssaListLabel(row)
    }));

    const loan = String(req.query.loan || '').trim();
    const { matchedIds, autoSelectId } = computeLoanMatches(rows || [], loan);

    let matchHint = '';
    if (loan) {
      if (matchedIds.length === 1) matchHint = 'Matched one investor for this loan number.';
      else if (matchedIds.length > 1) matchHint = 'Multiple investors match this loan — choose one below.';
      else matchHint = 'No investor row matched this loan — pick manually or set MYSQL_INVESTORS_LOAN_COLUMN / JSON matchingLoanNumbers in doc_ssa.';
    }

    res.json({
      success: true,
      configured: true,
      investors,
      loan: loan || null,
      matchedIds,
      autoSelectId,
      matchHint: loan ? matchHint : ''
    });
  } catch (err) {
    console.error('[Investors] list for-ssa-89', err.message);
    res.status(500).json({
      success: false,
      investors: [],
      message: 'Could not load investors. Check MySQL credentials and that doc_* columns exist.'
    });
  }
});

router.get('/:id/ssa-89-fields', listLimiter, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'Invalid investor id.' });
  }

  if (!isMysqlConfigured()) {
    return res.status(503).json({ success: false, message: 'MySQL is not configured.' });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ success: false, message: 'Database pool unavailable.' });
  }

  try {
    const t = table();
    const [rows] = await pool.query(
      `SELECT id, doc_4506c, doc_mailing_address, doc_ssa, doc_other FROM \`${t}\` WHERE id = ? LIMIT 1`,
      [id]
    );
    const row = rows && rows[0];
    if (!row) {
      return res.status(404).json({ success: false, message: 'Investor not found.' });
    }

    const fields = mapRowToSsaFields(row);
    res.json({ success: true, id: row.id, fields });
  } catch (err) {
    console.error('[Investors] ssa-89-fields', err.message);
    res.status(500).json({ success: false, message: 'Could not load investor row.' });
  }
});

module.exports = router;
