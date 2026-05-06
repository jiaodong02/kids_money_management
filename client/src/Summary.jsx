import React, { useState, useEffect } from 'react';

export default function Summary({ user }) {
  const [balance, setBalance] = useState(0);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ratePct, setRatePct] = useState('4.00');
  const [distDate, setDistDate] = useState(new Date().toISOString().slice(0, 10));
  const [distMsg, setDistMsg] = useState('');

  const load = async () => {
    const [balRes, sRes, rRes] = await Promise.all([
      fetch(`/api/balance?user=${user}`),
      fetch(`/api/summary?user=${user}`),
      fetch('/api/settings/interest-rate'),
    ]);
    setBalance((await balRes.json()).balance);
    const portfolios = await sRes.json();
    // Merge all portfolios into one summary (single portfolio per user now)
    const holdings = portfolios.flatMap(p => p.holdings);
    const totalCost = portfolios.reduce((s, p) => s + p.totalCost, 0);
    const totalValue = portfolios.reduce((s, p) => s + p.totalValue, 0);
    setSummary({ holdings, totalCost, totalValue });
    const r = (await rRes.json()).rate;
    setRatePct((r * 100).toFixed(2));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const saveRate = async () => {
    const pct = parseFloat(ratePct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setDistMsg('Rate must be between 0 and 100%.');
      return;
    }
    const r = pct / 100;
    const res = await fetch('/api/settings/interest-rate', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rate: r }),
    });
    if (res.ok) {
      setDistMsg(`Rate saved: ${(r * 100).toFixed(2)}%`);
    }
  };

  const distribute = async () => {
    const res = await fetch('/api/distribute-interest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: distDate }),
    });
    const { results } = await res.json();
    const parts = results.map(r =>
      r.skipped
        ? `${r.user}: skipped`
        : `${r.user}: +$${r.amount.toFixed(2)} (${r.days}d)`
    );
    setDistMsg(`Distributed on ${distDate} — ${parts.join(', ')}`);
    load();
  };

  const totalCost = summary ? summary.totalCost : 0;
  const totalValue = summary ? summary.totalValue : 0;
  const totalGain = totalValue - totalCost;
  const netWorth = balance + totalValue;

  return (
    <div>
      {/* Net Worth */}
      <div className="balance-bar">
        <span style={{ fontSize: 16 }}>Net Worth</span>
        <span className={`amount ${netWorth >= 0 ? 'positive' : 'negative'}`}>
          ${loading ? '...' : netWorth.toFixed(2)}
        </span>
      </div>

      {/* Breakdown: Cash / Investments / Gain */}
      <div className="balance-bar" style={{ marginTop: 0 }}>
        <div>
          <div style={{ fontSize: 13, color: '#777' }}>Cash</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
            ${loading ? '...' : balance.toFixed(2)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 13, color: '#777' }}>Invested (Cost)</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
            ${loading ? '...' : totalCost.toFixed(2)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 13, color: '#777' }}>Investment Value</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
            ${loading ? '...' : totalValue.toFixed(2)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 13, color: '#777' }}>Gain / Loss</div>
          <div className={`amount ${totalGain >= 0 ? 'positive' : 'negative'}`} style={{ fontSize: 22 }}>
            {loading ? '...' : (<>{totalGain >= 0 ? '+' : ''}${totalGain.toFixed(2)}</>)}
          </div>
          {!loading && totalCost > 0 && (
            <div className={totalGain >= 0 ? 'positive' : 'negative'} style={{ fontSize: 12 }}>
              {totalGain >= 0 ? '+' : ''}{((totalGain / totalCost) * 100).toFixed(1)}%
            </div>
          )}
        </div>
      </div>

      {/* Holdings Table */}
      {!loading && summary && summary.holdings.length > 0 && (
        <div className="card">
          <h3>Stock Holdings</h3>
          <table>
            <thead>
              <tr>
                <th>Ticker</th><th>Shares</th><th>Avg Cost</th>
                <th>Current Price</th><th>Value</th><th>Gain/Loss</th><th>%</th>
              </tr>
            </thead>
            <tbody>
              {summary.holdings.map(h => {
                const gain = h.value - h.cost_basis;
                const pct = h.cost_basis > 0 ? (gain / h.cost_basis) * 100 : 0;
                return (
                  <tr key={h.ticker}>
                    <td>
                      <strong>{h.ticker}</strong>
                      {h.name && <div style={{ fontSize: 11, color: '#999' }}>{h.name}</div>}
                    </td>
                    <td>{h.shares.toFixed(4)}</td>
                    <td>${h.avgCost.toFixed(2)}</td>
                    <td>${h.price.toFixed(2)}</td>
                    <td>${h.value.toFixed(2)}</td>
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
        </div>
      )}

      {!loading && (!summary || summary.holdings.length === 0) && (
        <div className="card">
          <h3>Stock Holdings</h3>
          <p className="loading">No stock holdings yet. Add trades in the Stock Portfolio tab.</p>
        </div>
      )}

      {/* Interest */}
      <div className="card">
        <h3>Interest</h3>
        <p style={{ fontSize: 13, color: '#777', marginTop: 0 }}>
          Annual rate, applied to time-weighted average cash balance since the last distribution.
          Distribution always runs for both kids together, and is also auto-triggered on every stock trade.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <label>Rate (%)
            <input
              type="number" step="0.01" min="0" max="100"
              value={ratePct}
              onChange={e => setRatePct(e.target.value)}
              style={{ width: 90 }}
            />
          </label>
          <button type="button" className="btn btn-secondary" onClick={saveRate}>Save Rate</button>
          <label>Distribute as of
            <input type="date" value={distDate} onChange={e => setDistDate(e.target.value)} />
          </label>
          <button type="button" className="btn btn-primary" onClick={distribute}>
            Distribute for Both Kids
          </button>
        </div>
        {distMsg && <p style={{ fontSize: 13, marginTop: 10 }}>{distMsg}</p>}
      </div>
    </div>
  );
}
