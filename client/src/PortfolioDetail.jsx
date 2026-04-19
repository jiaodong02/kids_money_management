import React, { useState, useEffect } from 'react';

export default function PortfolioDetail({ portfolio, onBack }) {
  const [holdings, setHoldings] = useState([]);
  const [trades, setTrades] = useState([]);
  const [quotes, setQuotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    type: 'buy',
    ticker: '',
    shares: '',
    price_per_share: '',
    notes: '',
  });

  const load = async () => {
    const [hRes, tRes] = await Promise.all([
      fetch(`/api/portfolios/${portfolio.id}/holdings`),
      fetch(`/api/portfolios/${portfolio.id}/trades`),
    ]);
    const h = await hRes.json();
    const t = await tRes.json();
    setHoldings(h);
    setTrades(t);

    // Fetch live quotes for all held tickers
    if (h.length > 0) {
      const tickers = h.map(x => x.ticker);
      const qRes = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers }),
      });
      setQuotes(await qRes.json());
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.ticker || !form.shares || !form.price_per_share) return;
    await fetch(`/api/portfolios/${portfolio.id}/trades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        shares: parseFloat(form.shares),
        price_per_share: parseFloat(form.price_per_share),
      }),
    });
    setForm({ ...form, ticker: '', shares: '', price_per_share: '', notes: '' });
    setLoading(true);
    load();
  };

  const removeTrade = async (id) => {
    if (!confirm('Delete this trade?')) return;
    await fetch(`/api/trades/${id}`, { method: 'DELETE' });
    setLoading(true);
    load();
  };

  const lookupPrice = async () => {
    if (!form.ticker) return;
    try {
      const res = await fetch(`/api/quote/${form.ticker}`);
      if (res.ok) {
        const data = await res.json();
        setForm({ ...form, price_per_share: data.price.toFixed(2) });
      }
    } catch (e) { /* ignore */ }
  };

  // Compute totals
  const totalCost = holdings.reduce((s, h) => s + h.cost_basis, 0);
  const totalValue = holdings.reduce((s, h) => {
    const q = quotes[h.ticker];
    return s + (q ? q.price * h.shares : h.cost_basis);
  }, 0);
  const totalGain = totalValue - totalCost;

  return (
    <div>
      <span className="back-link" onClick={onBack}>&larr; Back to Portfolios</span>
      <h2>{portfolio.name}</h2>

      {/* Summary */}
      <div className="balance-bar" style={{ marginTop: 12 }}>
        <div>
          <div style={{ fontSize: 13, color: '#777' }}>Total Value</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>${totalValue.toFixed(2)}</div>
        </div>
        <div>
          <div style={{ fontSize: 13, color: '#777' }}>Total Cost</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>${totalCost.toFixed(2)}</div>
        </div>
        <div>
          <div style={{ fontSize: 13, color: '#777' }}>Gain / Loss</div>
          <div className={`amount ${totalGain >= 0 ? 'positive' : 'negative'}`} style={{ fontSize: 24 }}>
            {totalGain >= 0 ? '+' : ''}${totalGain.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Holdings */}
      <div className="card">
        <h3>Holdings</h3>
        {loading ? <p className="loading">Loading...</p> : holdings.length === 0 ? (
          <p className="loading">No holdings. Add a trade below.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Ticker</th><th>Shares</th><th>Avg Cost</th>
                <th>Current Price</th><th>Value</th><th>Gain/Loss</th><th>%</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map(h => {
                const q = quotes[h.ticker];
                const avgCost = h.cost_basis / h.shares;
                const curPrice = q ? q.price : avgCost;
                const value = curPrice * h.shares;
                const gain = value - h.cost_basis;
                const pct = h.cost_basis > 0 ? (gain / h.cost_basis) * 100 : 0;
                return (
                  <tr key={h.ticker}>
                    <td><strong>{h.ticker}</strong>{q ? <div style={{ fontSize: 11, color: '#999' }}>{q.name}</div> : null}</td>
                    <td>{h.shares.toFixed(4)}</td>
                    <td>${avgCost.toFixed(2)}</td>
                    <td>{q ? `$${curPrice.toFixed(2)}` : <span className="loading">-</span>}</td>
                    <td>${value.toFixed(2)}</td>
                    <td className={gain >= 0 ? 'positive' : 'negative'}>
                      {gain >= 0 ? '+' : ''}${gain.toFixed(2)}
                    </td>
                    <td className={gain >= 0 ? 'positive' : 'negative'}>
                      {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Trade Form */}
      <div className="card">
        <h3>Add Trade</h3>
        <form onSubmit={submit}>
          <label>Date <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
          <label>Type
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </label>
          <label>Ticker
            <div style={{ display: 'flex', gap: 4 }}>
              <input type="text" value={form.ticker} onChange={e => setForm({ ...form, ticker: e.target.value.toUpperCase() })} placeholder="AAPL" style={{ width: 80 }} />
              <button type="button" className="btn btn-secondary" onClick={lookupPrice} style={{ fontSize: 12 }}>Lookup</button>
            </div>
          </label>
          <label>Shares <input type="number" step="0.0001" min="0.0001" value={form.shares} onChange={e => setForm({ ...form, shares: e.target.value })} placeholder="0" /></label>
          <label>Price/Share <input type="number" step="0.01" min="0.01" value={form.price_per_share} onChange={e => setForm({ ...form, price_per_share: e.target.value })} placeholder="0.00" /></label>
          <label>Notes <input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional" /></label>
          <button type="submit" className="btn btn-primary">Add Trade</button>
        </form>
      </div>

      {/* Trade History */}
      <div className="card">
        <h3>Trade History</h3>
        {trades.length === 0 ? (
          <p className="loading">No trades yet.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Date</th><th>Type</th><th>Ticker</th><th>Shares</th><th>Price</th><th>Total</th><th>Notes</th><th></th></tr>
            </thead>
            <tbody>
              {trades.map(t => (
                <tr key={t.id}>
                  <td>{t.date}</td>
                  <td className={t.type === 'buy' ? 'negative' : 'positive'}>{t.type.toUpperCase()}</td>
                  <td>{t.ticker}</td>
                  <td>{t.shares}</td>
                  <td>${t.price_per_share.toFixed(2)}</td>
                  <td>${(t.shares * t.price_per_share).toFixed(2)}</td>
                  <td>{t.notes}</td>
                  <td><button className="btn btn-danger" onClick={() => removeTrade(t.id)}>Del</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
