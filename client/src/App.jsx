import React, { useState } from 'react';
import Summary from './Summary';
import Ledger from './Ledger';
import Portfolio from './Portfolio';
import './style.css';

const USERS = ['Valentina', 'Tiana'];
const TABS = ['Summary', 'Cash Ledger', 'Stock Portfolio'];

export default function App() {
  const [user, setUser] = useState(USERS[0]);
  const [tab, setTab] = useState(0);

  return (
    <div className="app">
      <h1>Kids Money Manager</h1>
      <nav className="user-tabs">
        {USERS.map(u => (
          <button key={u} className={user === u ? 'active' : ''} onClick={() => setUser(u)}>
            {u}
          </button>
        ))}
      </nav>
      <nav className="tabs">
        {TABS.map((t, i) => (
          <button key={t} className={tab === i ? 'active' : ''} onClick={() => setTab(i)}>
            {t}
          </button>
        ))}
      </nav>
      <div className="content">
        {tab === 0 && <Summary key={`s-${user}`} user={user} />}
        {tab === 1 && <Ledger key={`l-${user}`} user={user} />}
        {tab === 2 && <Portfolio key={`p-${user}`} user={user} />}
      </div>
    </div>
  );
}
