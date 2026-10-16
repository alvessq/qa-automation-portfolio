import type { ReactNode } from 'react';

export function Page({ title, eyebrow, description, actions, children }: { title: string; eyebrow: string; description: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <main className="container">
      <div className="hero">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {actions ? <div className="hero-actions">{actions}</div> : null}
      </div>
      <div className="stack">{children}</div>
    </main>
  );
}
