'use client';

import { useMemo, useState } from 'react';
import type { MahjongCard, Hand } from '../lib/types';
import { colorNotation, themeForCategory } from '../lib/theme';

type Filter = 'all' | 'remaining' | 'won';

interface Props {
  card: MahjongCard;
  handCounts: Record<string, number>;
  handNotes: Record<string, string>;
  onBump: (handId: string, delta: number) => void;
  onSaveNotation: (handId: string, notation: string) => void;
}

export default function CardTab({ card, handCounts, handNotes, onBump, onSaveNotation }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<string | null>(null);

  const notationOf = (h: Hand) => handNotes[h.id] ?? h.notation;
  const countOf = (h: Hand) => handCounts[h.id] ?? 0;

  const stats = useMemo(() => {
    let cleared = 0;
    let totalWins = 0;
    let totalPoints = 0;
    for (const h of card.hands) {
      const c = countOf(h);
      if (c > 0) cleared += 1;
      totalWins += c;
      totalPoints += c * h.points;
    }
    return { cleared, totalWins, totalPoints };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, handCounts]);

  const visible = (h: Hand) => {
    const c = countOf(h);
    if (filter === 'won') return c > 0;
    if (filter === 'remaining') return c === 0;
    return true;
  };

  const pct = Math.round((stats.cleared / card.hands.length) * 100);

  return (
    <div className="screen">
      <header className="app-header" style={{ padding: '12px 2px 4px' }}>
        <h1>Your {card.year} Card</h1>
        <p className="sub">Tap a hand each time you win it. Clear all {card.hands.length}.</p>
      </header>

      <div className="stats" style={{ marginTop: 14 }}>
        <div className="stat">
          <div className="num">
            {stats.cleared}
            <span style={{ fontSize: 15, color: 'var(--muted)', fontWeight: 800 }}>/{card.hands.length}</span>
          </div>
          <div className="lab">Cleared</div>
        </div>
        <div className="stat">
          <div className="num">{stats.totalWins}</div>
          <div className="lab">Total wins</div>
        </div>
        <div className="stat">
          <div className="num">{stats.totalPoints}</div>
          <div className="lab">Points</div>
        </div>
      </div>

      <div className="progress" aria-label={`${pct}% of card cleared`}>
        <span style={{ width: `${pct}%` }} />
      </div>

      <div className="segmented" style={{ marginTop: 16 }}>
        {(['all', 'remaining', 'won'] as Filter[]).map((f) => (
          <button key={f} data-active={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f === 'remaining' ? 'Remaining' : 'Won'}
          </button>
        ))}
      </div>

      {card.categories.map((category) => {
        const hands = card.hands.filter((h) => h.category === category && visible(h));
        if (hands.length === 0) return null;
        const theme = themeForCategory(card.categories, category);
        const wonInCat = card.hands.filter((h) => h.category === category && countOf(h) > 0).length;
        const totalInCat = card.hands.filter((h) => h.category === category).length;
        return (
          <section key={category}>
            <div className="cat-head">
              <span className="pill" style={{ background: theme.bg, color: theme.accent }}>
                {category}
              </span>
              <span className="count">
                {wonInCat}/{totalInCat} won
              </span>
            </div>
            {hands.map((h) => {
              const count = countOf(h);
              const isEditing = editing === h.id;
              return (
                <div key={h.id} className={`hand${count > 0 ? ' won' : ''}`}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {isEditing ? (
                      <input
                        className="field"
                        defaultValue={notationOf(h)}
                        autoFocus
                        onBlur={(e) => {
                          onSaveNotation(h.id, e.target.value.trim() || h.notation);
                          setEditing(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          if (e.key === 'Escape') setEditing(null);
                        }}
                      />
                    ) : (
                      <>
                        <div className="notation">
                          {colorNotation(notationOf(h)).map((g, i) => (
                            <span key={i} style={{ color: g.color }}>
                              {g.text}
                              {i < colorNotation(notationOf(h)).length - 1 ? ' ' : ''}
                            </span>
                          ))}
                        </div>
                        <div className="meta">
                          <span className="pts">{h.points} pts</span>
                          {h.concealed && <span className="badge-c" title="Concealed">C</span>}
                          <button
                            className="icon-btn"
                            style={{ width: 26, height: 26, fontSize: 12 }}
                            onClick={() => setEditing(h.id)}
                            aria-label="Edit notation"
                          >
                            ✎
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="counter">
                      <button
                        className="round-btn ghost"
                        onClick={() => onBump(h.id, -1)}
                        disabled={count === 0}
                        aria-label="Remove a win"
                      >
                        −
                      </button>
                      <span className="val">{count}</span>
                      <button
                        className="round-btn"
                        style={{ background: theme.accent }}
                        onClick={() => onBump(h.id, +1)}
                        aria-label="Log a win"
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}

      <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12, fontWeight: 700, marginTop: 28 }}>
        Sample card — notations are editable & illustrative, not the official NMJL card.
      </p>
    </div>
  );
}
