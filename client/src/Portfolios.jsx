import React, { useState, useEffect } from 'react';
import PortfolioDetail from './PortfolioDetail';

export default function Portfolios({ user }) {
  const [portfolios, setPortfolios] = useState([]);
  const [selected, setSelected] = useState(null);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  const load = async () => {
    const res = await fetch(`/api/portfolios?user=${user}`);
    setPortfolios(await res.json());
  };

  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await fetch('/api/portfolios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, name: newName.trim() }),
    });
    setNewName('');
    load();
  };

  const startRename = (p, e) => {
    e.stopPropagation();
    setEditingId(p.id);
    setEditName(p.name);
  };

  const saveRename = async (id, e) => {
    e.stopPropagation();
    if (!editName.trim()) return;
    await fetch(`/api/portfolios/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim() }),
    });
    setEditingId(null);
    load();
  };

  const cancelRename = (e) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const remove = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this portfolio and all its trades?')) return;
    await fetch(`/api/portfolios/${id}`, { method: 'DELETE' });
    load();
  };

  if (selected) {
    return <PortfolioDetail portfolio={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div>
      <div className="card">
        <h3>Create Portfolio</h3>
        <form onSubmit={create} className="inline-form">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Portfolio name"
          />
          <button type="submit" className="btn btn-primary">Create</button>
        </form>
      </div>

      <div className="portfolio-list">
        {portfolios.length === 0 && <p className="loading">No portfolios yet. Create one above.</p>}
        {portfolios.map(p => (
          <div key={p.id} className="portfolio-item" onClick={() => setSelected(p)}>
            {editingId === p.id ? (
              <form onSubmit={(e) => { e.preventDefault(); saveRename(p.id, e); }} className="inline-form" onClick={e => e.stopPropagation()} style={{ margin: 0 }}>
                <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus />
                <button type="submit" className="btn btn-primary" style={{ fontSize: 12 }}>Save</button>
                <button type="button" className="btn btn-secondary" onClick={cancelRename} style={{ fontSize: 12 }}>Cancel</button>
              </form>
            ) : (
              <>
                <span><strong>{p.name}</strong></span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary" onClick={(e) => startRename(p, e)} style={{ fontSize: 12 }}>Rename</button>
                  <button className="btn btn-danger" onClick={(e) => remove(p.id, e)}>Delete</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
