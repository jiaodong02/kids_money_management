const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'data.sqlite'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('deposit', 'withdrawal')),
    amount REAL NOT NULL CHECK(amount > 0),
    notes TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS portfolios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user, name)
  );

  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('buy', 'sell')),
    ticker TEXT NOT NULL,
    shares REAL NOT NULL CHECK(shares > 0),
    price_per_share REAL NOT NULL CHECK(price_per_share > 0),
    notes TEXT DEFAULT ''
  );
`);

// Migration: add user column if missing (existing DBs)
try {
  db.prepare("SELECT user FROM transactions LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE transactions ADD COLUMN user TEXT NOT NULL DEFAULT ''");
}
try {
  db.prepare("SELECT user FROM portfolios LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE portfolios ADD COLUMN user TEXT NOT NULL DEFAULT ''");
}

module.exports = db;
