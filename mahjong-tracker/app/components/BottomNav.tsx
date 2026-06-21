'use client';

export type Tab = 'card' | 'wins' | 'group' | 'learn';

const TABS: { id: Tab; label: string; glyph: string }[] = [
  { id: 'card', label: 'Card', glyph: '🀄' },
  { id: 'wins', label: 'Wins', glyph: '🏆' },
  { id: 'group', label: 'Group', glyph: '👥' },
  { id: 'learn', label: 'Learn', glyph: '💡' },
];

export default function BottomNav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="bottom-nav">
      <div className="inner">
        {TABS.map((t) => (
          <button key={t.id} data-active={tab === t.id} onClick={() => onChange(t.id)} aria-label={t.label}>
            <span className="glyph">{t.glyph}</span>
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
