import { useState } from 'react';
import { attempt, send, usePolling } from './lib/api';
import { Home } from './pages/Home';
import { ProductPage } from './pages/ProductPage';
import type { Overview } from './types';

const NAV = [
  { path: '/', label: 'Visão geral' },
  { path: '/mobile', label: 'Mobile' },
  { path: '/web', label: 'Web' },
];

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const overview = usePolling<Overview>('/api/overview', 5000);
  const [pauseError, setPauseError] = useState('');
  const paused = overview.data?.paused;

  async function togglePause() {
    setPauseError(await attempt(() => send('POST', '/api/pause', { paused: !paused })));
    await overview.reload();
  }

  return (
    <>
      <header className="topbar">
        <a className="brand" href="/">
          <span className="logo" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="20" height="20">
              <path d="M8 16.5l5 5L24 10" stroke="currentColor" strokeWidth="3.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span>
            Painel <b>de testes</b>
          </span>
        </a>
        <nav aria-label="Seções">
          {NAV.map((item) => (
            <a key={item.path} className={path === item.path ? 'active' : ''} aria-current={path === item.path ? 'page' : undefined} href={item.path}>
              {item.label}
            </a>
          ))}
        </nav>
        {paused !== undefined ? (
          <div className="agenda-toggle" title={pauseError || undefined}>
            <span className={`pill ${paused ? 'paused' : 'active'}`}>
              <span className="pill-dot" aria-hidden="true" />
              {paused ? 'Agenda pausada' : 'Agenda rodando'}
            </span>
            <button className={`compact ${paused ? 'activate' : 'pause'}`} onClick={() => void togglePause()}>
              {paused ? 'Retomar agenda' : 'Pausar agenda'}
            </button>
          </div>
        ) : null}
      </header>
      {path === '/mobile' ? <ProductPage product="mobile" /> : path === '/web' ? <ProductPage product="web" /> : <Home overview={overview.data} error={overview.error} reload={overview.reload} />}
    </>
  );
}
