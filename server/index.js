const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const app = express();
app.use(cors());
app.use(express.json());

// --- Interest distribution ---

const KIDS = ['Valentina', 'Tiana'];

function getInterestRate() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'interest_rate'").get();
  return row ? parseFloat(row.value) : 0.04;
}

function daysBetween(d1, d2) {
  const a = Date.parse(d1 + 'T00:00:00Z');
  const b = Date.parse(d2 + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

function lastInterestDate(user) {
  const r = db.prepare("SELECT MAX(date) AS d FROM transactions WHERE user = ? AND is_interest = 1").get(user);
  if (r && r.d) return r.d;
  const f = db.prepare("SELECT MIN(date) AS d FROM transactions WHERE user = ?").get(user);
  return f && f.d ? f.d : null;
}

function balanceAsOf(user, date) {
  const dep = db.prepare("SELECT COALESCE(SUM(amount),0) AS t FROM transactions WHERE user = ? AND type = 'deposit' AND date <= ?").get(user, date).t;
  const wd = db.prepare("SELECT COALESCE(SUM(amount),0) AS t FROM transactions WHERE user = ? AND type = 'withdrawal' AND date <= ?").get(user, date).t;
  return dep - wd;
}

// Time-weighted: sum(balance × days_in_segment) / 365 × rate.
function computeInterest(user, asOfDate, rate) {
  const startDate = lastInterestDate(user);
  if (!startDate) return { skip: 'no_history' };
  const totalDays = daysBetween(startDate, asOfDate);
  if (totalDays <= 0) return { skip: 'no_days_elapsed', startDate };

  const startBalance = balanceAsOf(user, startDate);
  const txs = db.prepare(
    "SELECT date, type, amount FROM transactions WHERE user = ? AND date > ? AND date <= ? ORDER BY date ASC, id ASC"
  ).all(user, startDate, asOfDate);

  let runningBalance = startBalance;
  let prevDate = startDate;
  let weighted = 0;
  for (const tx of txs) {
    const seg = daysBetween(prevDate, tx.date);
    weighted += runningBalance * seg;
    runningBalance += tx.type === 'deposit' ? tx.amount : -tx.amount;
    prevDate = tx.date;
  }
  weighted += runningBalance * daysBetween(prevDate, asOfDate);

  const interest = (weighted / 365) * rate;
  return { startDate, totalDays, interest };
}

function distributeInterestAllUsers(asOfDate) {
  const rate = getInterestRate();
  const out = [];
  for (const user of KIDS) {
    const info = computeInterest(user, asOfDate, rate);
    if (info.skip) {
      out.push({ user, skipped: true, reason: info.skip });
      continue;
    }
    if (info.interest <= 0.005) {
      out.push({ user, skipped: true, reason: 'too_small' });
      continue;
    }
    const amount = Math.round(info.interest * 100) / 100;
    const notes = `Interest @${(rate * 100).toFixed(2)}% for ${info.totalDays} days (since ${info.startDate})`;
    db.prepare(
      "INSERT INTO transactions (user, date, type, amount, notes, is_interest) VALUES (?, ?, 'deposit', ?, ?, 1)"
    ).run(user, asOfDate, amount, notes);
    out.push({ user, amount, days: info.totalDays, since: info.startDate });
  }
  return out;
}

// --- Transactions ---

app.get('/api/transactions', (req, res) => {
  const user = req.query.user || '';
  const rows = db.prepare('SELECT * FROM transactions WHERE user = ? ORDER BY date DESC, id DESC').all(user);
  res.json(rows);
});

app.post('/api/transactions', (req, res) => {
  const { user, date, type, amount, notes } = req.body;
  if (!date || !type || !amount) return res.status(400).json({ error: 'Missing fields' });
  const result = db.prepare('INSERT INTO transactions (user, date, type, amount, notes) VALUES (?, ?, ?, ?, ?)').run(user || '', date, type, amount, notes || '');
  res.json({ id: result.lastInsertRowid });
});

app.delete('/api/transactions/:id', (req, res) => {
  db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- Cash Balance ---

app.get('/api/balance', (req, res) => {
  const user = req.query.user || '';
  const deposits = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user = ? AND type = 'deposit'").get(user).total;
  const withdrawals = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user = ? AND type = 'withdrawal'").get(user).total;
  res.json({ balance: deposits - withdrawals });
});

// --- Portfolios ---

app.get('/api/portfolios', (req, res) => {
  const user = req.query.user || '';
  const rows = db.prepare('SELECT * FROM portfolios WHERE user = ? ORDER BY created_at DESC').all(user);
  res.json(rows);
});

app.post('/api/portfolios', (req, res) => {
  const { user, name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const result = db.prepare('INSERT INTO portfolios (user, name) VALUES (?, ?)').run(user || '', name);
    res.json({ id: result.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: 'Portfolio name already exists' });
  }
});

app.put('/api/portfolios/:id', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    db.prepare('UPDATE portfolios SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Portfolio name already exists' });
  }
});

app.delete('/api/portfolios/:id', (req, res) => {
  db.prepare('DELETE FROM portfolios WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- Trades ---

app.get('/api/portfolios/:id/trades', (req, res) => {
  const rows = db.prepare('SELECT * FROM trades WHERE portfolio_id = ? ORDER BY date DESC, id DESC').all(req.params.id);
  res.json(rows);
});

app.post('/api/portfolios/:id/trades', (req, res) => {
  const { date, type, ticker, shares, price_per_share, notes } = req.body;
  if (!date || !type || !ticker || !shares || !price_per_share) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  const portfolio = db.prepare('SELECT user FROM portfolios WHERE id = ?').get(req.params.id);
  if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' });

  const insertTrade = db.transaction(() => {
    // Distribute accrued interest for both kids up to the trade date,
    // before the trade's own cash entry lands.
    const interest = distributeInterestAllUsers(date);

    const tradeResult = db.prepare(
      'INSERT INTO trades (portfolio_id, date, type, ticker, shares, price_per_share, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(req.params.id, date, type, ticker.toUpperCase(), shares, price_per_share, notes || '');
    const tradeId = tradeResult.lastInsertRowid;

    // Auto-create cash transaction: buy = withdrawal, sell = deposit
    const cashType = type === 'buy' ? 'withdrawal' : 'deposit';
    const amount = shares * price_per_share;
    const cashNotes = `${type === 'buy' ? 'Buy' : 'Sell'} stock: ${ticker.toUpperCase()} (${shares} shares @ $${price_per_share})`;
    db.prepare(
      'INSERT INTO transactions (user, date, type, amount, notes, trade_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(portfolio.user, date, cashType, amount, cashNotes, tradeId);

    return { tradeId, interest };
  });

  const { tradeId, interest } = insertTrade();
  res.json({ id: tradeId, interest });
});

app.delete('/api/trades/:id', (req, res) => {
  const deleteTrade = db.transaction(() => {
    // Delete linked cash transaction first
    db.prepare('DELETE FROM transactions WHERE trade_id = ?').run(req.params.id);
    db.prepare('DELETE FROM trades WHERE id = ?').run(req.params.id);
  });
  deleteTrade();
  res.json({ ok: true });
});

// --- Summary (all portfolios with holdings + live prices) ---

function computeHoldings(portfolioId) {
  const trades = db.prepare('SELECT * FROM trades WHERE portfolio_id = ? ORDER BY date ASC').all(portfolioId);
  const holdings = {};
  for (const t of trades) {
    if (!holdings[t.ticker]) holdings[t.ticker] = { ticker: t.ticker, shares: 0, cost_basis: 0 };
    if (t.type === 'buy') {
      holdings[t.ticker].cost_basis += t.shares * t.price_per_share;
      holdings[t.ticker].shares += t.shares;
    } else {
      const avgCost = holdings[t.ticker].shares > 0 ? holdings[t.ticker].cost_basis / holdings[t.ticker].shares : 0;
      holdings[t.ticker].shares -= t.shares;
      holdings[t.ticker].cost_basis = avgCost * holdings[t.ticker].shares;
    }
  }
  return Object.values(holdings).filter(h => h.shares > 0.0001);
}

app.get('/api/summary', async (req, res) => {
  const user = req.query.user || '';
  const portfolios = db.prepare('SELECT * FROM portfolios WHERE user = ? ORDER BY created_at DESC').all(user);

  // Compute holdings for each portfolio
  const allTickers = new Set();
  const portfolioData = portfolios.map(p => {
    const holdings = computeHoldings(p.id);
    holdings.forEach(h => allTickers.add(h.ticker));
    return { ...p, holdings };
  });

  // Fetch all quotes at once
  const quotes = {};
  if (allTickers.size > 0) {
    await Promise.all([...allTickers].map(async (t) => {
      try {
        const quote = await yahooFinance.quote(t);
        quotes[t] = { price: quote.regularMarketPrice, name: quote.shortName || quote.longName };
      } catch (e) { quotes[t] = null; }
    }));
  }

  // Build response
  const result = portfolioData.map(p => {
    let totalCost = 0;
    let totalValue = 0;
    const holdings = p.holdings.map(h => {
      const q = quotes[h.ticker];
      const avgCost = h.cost_basis / h.shares;
      const price = q ? q.price : avgCost;
      const value = price * h.shares;
      totalCost += h.cost_basis;
      totalValue += value;
      return { ticker: h.ticker, name: q ? q.name : '', shares: h.shares, avgCost, price, value, cost_basis: h.cost_basis };
    });
    return { id: p.id, name: p.name, totalCost, totalValue, holdings };
  });

  res.json(result);
});

// --- Holdings (computed) ---

app.get('/api/portfolios/:id/holdings', (req, res) => {
  res.json(computeHoldings(req.params.id));
});

// --- Stock Quote ---

app.get('/api/quote/:ticker', async (req, res) => {
  try {
    const quote = await yahooFinance.quote(req.params.ticker.toUpperCase());
    res.json({
      ticker: quote.symbol,
      price: quote.regularMarketPrice,
      change: quote.regularMarketChange,
      changePercent: quote.regularMarketChangePercent,
      name: quote.shortName || quote.longName,
    });
  } catch (e) {
    res.status(404).json({ error: 'Ticker not found' });
  }
});

// Batch quotes
app.post('/api/quotes', async (req, res) => {
  const { tickers } = req.body;
  if (!tickers || !tickers.length) return res.json({});
  const results = {};
  await Promise.all(tickers.map(async (t) => {
    try {
      const quote = await yahooFinance.quote(t.toUpperCase());
      results[t.toUpperCase()] = {
        price: quote.regularMarketPrice,
        change: quote.regularMarketChange,
        changePercent: quote.regularMarketChangePercent,
        name: quote.shortName || quote.longName,
      };
    } catch (e) {
      results[t.toUpperCase()] = null;
    }
  }));
  res.json(results);
});

// --- Interest settings & manual distribution ---

app.get('/api/settings/interest-rate', (req, res) => {
  res.json({ rate: getInterestRate() });
});

app.put('/api/settings/interest-rate', (req, res) => {
  const { rate } = req.body;
  const r = parseFloat(rate);
  if (!Number.isFinite(r) || r < 0 || r > 1) {
    return res.status(400).json({ error: 'rate must be a fraction between 0 and 1 (e.g. 0.04 for 4%)' });
  }
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('interest_rate', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(String(r));
  res.json({ rate: r });
});

app.post('/api/distribute-interest', (req, res) => {
  const date = (req.body && req.body.date) || new Date().toISOString().slice(0, 10);
  const run = db.transaction(() => distributeInterestAllUsers(date));
  res.json({ date, results: run() });
});

// Serve static frontend in production
app.use(express.static(path.join(__dirname, '..', 'dist')));

// SPA fallback
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
