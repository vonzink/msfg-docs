'use strict';

const mysql = require('mysql2/promise');

let pool;

function isMysqlConfigured() {
  return !!(
    process.env.MYSQL_HOST &&
    process.env.MYSQL_USER &&
    process.env.MYSQL_PASSWORD &&
    process.env.MYSQL_DATABASE
  );
}

function getPool() {
  if (!isMysqlConfigured()) return null;
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: parseInt(process.env.MYSQL_PORT || '3306', 10) || 3306,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: parseInt(process.env.MYSQL_CONNECTION_LIMIT || '5', 10) || 5,
      connectTimeout: parseInt(process.env.MYSQL_CONNECT_TIMEOUT_MS || '8000', 10) || 8000
    });
  }
  return pool;
}

module.exports = { getPool, isMysqlConfigured };
