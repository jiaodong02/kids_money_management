import React, { useState, useEffect } from 'react';

export default function Ledger({ user }) {
  const [transactions, setTransactions] = useState([]);
  const [balance, setBalance] = useState(0);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), type: 'deposit', amount: '', notes: '' });

  const load = async () => {
    const [txRes, balRes] = await Promise.all([fetch(`/api/transactions?user=${user}`), fetch(`/api/balance?user=${user}`)]);
    setTransactions(await txRes.json());
    setBalance((await balRes.json()).balance);
  };

  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.amount) return;
    await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, user, amount: parseFloat(form.amount) }),
    });
    setForm({ ...form, amount: '', notes: '' });
    load();
  };

  const remove = async (id) => {
    if (!confirm('Delete this transaction?')) return;
    await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div>
      <div className="balance-bar">
        <span>Available Cash</span>
        <span className={`amount ${balance >= 0 ? 'positive' : 'negative'}`}>
          ${balance.toFixed(2)}
        </span>
      </div>

      <div className="card">
        <h3>Add Transaction</h3>
        <form onSubmit={submit}>
          <label>Date <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
          <label>Type
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              <option value="deposit">Deposit</option>
              <option value="withdrawal">Withdrawal</option>
            </select>
          </label>
          <label>Amount <input type="number" step="0.01" min="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0.00" /></label>
          <label>Notes <input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional" /></label>
          <button type="submit" className="btn btn-primary">Add</button>
        </form>
      </div>

      <div className="card">
        <h3>Transaction History</h3>
        {transactions.length === 0 ? (
          <p className="loading">No transactions yet.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Date</th><th>Type</th><th>Amount</th><th>Notes</th><th></th></tr>
            </thead>
            <tbody>
              {transactions.map(t => (
                <tr key={t.id}>
                  <td>{t.date}</td>
                  <td>{t.type === 'deposit' ? 'Deposit' : 'Withdrawal'}</td>
                  <td className={t.type === 'deposit' ? 'positive' : 'negative'}>
                    {t.type === 'deposit' ? '+' : '-'}${t.amount.toFixed(2)}
                  </td>
                  <td>{t.notes}</td>
                  <td><button className="btn btn-danger" onClick={() => remove(t.id)}>Del</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
