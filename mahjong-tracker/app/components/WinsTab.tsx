'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MahjongCard, Win } from '../lib/types';
import { downscaleImage } from '../lib/image';
import { buildShareCard, downloadBlob } from '../lib/shareCard';
import { recordShare, track } from '../lib/analytics';

interface Props {
  card: MahjongCard;
  handNotes: Record<string, string>;
  wins: Win[];
  groupName: string;
  onAddWin: (win: Win) => void;
  onRemoveWin: (id: string) => void;
  onBump: (handId: string, delta: number) => void;
  onPostToGroup: (win: Win) => void;
}

export default function WinsTab({
  card,
  handNotes,
  wins,
  groupName,
  onAddWin,
  onRemoveWin,
  onBump,
  onPostToGroup,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="screen">
      <header className="app-header" style={{ padding: '12px 2px 4px' }}>
        <h1>Your Wins</h1>
        <p className="sub">Log a win with a photo & note. Make a share card to brag.</p>
      </header>

      <button className="btn coral" style={{ marginTop: 14 }} onClick={() => setOpen(true)}>
        ＋ Log a win
      </button>

      {wins.length === 0 ? (
        <div className="empty">
          <div className="big">🏆</div>
          No wins yet. Win a hand at your next game and log it here!
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          {wins.map((w) => (
            <WinCard key={w.id} win={w} onRemove={() => onRemoveWin(w.id)} />
          ))}
        </div>
      )}

      {open && (
        <LogWinSheet
          card={card}
          handNotes={handNotes}
          groupName={groupName}
          onClose={() => setOpen(false)}
          onSave={(win, opts) => {
            onAddWin(win);
            // Posting a win advances your tracker (and the leaderboard)…
            if (win.handId) onBump(win.handId, +1);
            // …and optionally lands in the group feed.
            if (opts.shareToGroup) onPostToGroup(win);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function WinCard({ win, onRemove }: { win: Win; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!win.photo) return;
    const u = URL.createObjectURL(win.photo);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [win.photo]);

  const when = new Date(win.createdAt).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  async function share() {
    setSharing(true);
    try {
      const blob = await buildShareCard(win, win.handLabel);
      const file = new File([blob], 'mahjong-win.png', { type: 'image/png' });
      // Prefer native share sheet on mobile; fall back to download.
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My Mahjong win!' });
      } else {
        downloadBlob(blob, 'mahjong-win.png');
      }
      await recordShare(win.handLabel);
    } catch {
      /* user cancelled or share failed — no-op */
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="win">
      {url && <img className="photo" src={url} alt="Win photo" />}
      <div className="body">
        <div className="when">{when}</div>
        {win.handLabel && (
          <p className="note" style={{ fontWeight: 800 }}>
            🀄 {win.handLabel}
          </p>
        )}
        {win.note && <p className="note">{win.note}</p>}
        <div className="actions">
          <button className="btn coral" onClick={share} disabled={sharing}>
            {sharing ? 'Making…' : '↗ Share card'}
          </button>
          <button className="btn ghost" onClick={onRemove} aria-label="Delete win">
            🗑
          </button>
        </div>
      </div>
    </div>
  );
}

function LogWinSheet({
  card,
  handNotes,
  groupName,
  onClose,
  onSave,
}: {
  card: MahjongCard;
  handNotes: Record<string, string>;
  groupName: string;
  onClose: () => void;
  onSave: (win: Win, opts: { shareToGroup: boolean }) => void;
}) {
  const [handId, setHandId] = useState<string>('');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [shareToGroup, setShareToGroup] = useState(true);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const labelFor = (id: string) => {
    const h = card.hands.find((x) => x.id === id);
    return h ? handNotes[h.id] ?? h.notation : null;
  };

  const previewUrl = useMemo(() => preview, [preview]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const blob = await downscaleImage(file);
      setPhoto(blob);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(blob));
    } finally {
      setBusy(false);
    }
  }

  function save() {
    const win: Win = {
      id: crypto.randomUUID(),
      handId: handId || null,
      handLabel: handId ? labelFor(handId) : null,
      note: note.trim(),
      photo,
      createdAt: Date.now(),
    };
    void track('win_logged', { hasPhoto: !!photo, hasHand: !!handId, sharedToGroup: shareToGroup });
    onSave(win, { shareToGroup });
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h2>Log a win 🎉</h2>

        <label className="lbl">Which hand?</label>
        <select className="field" value={handId} onChange={(e) => setHandId(e.target.value)}>
          <option value="">Freeform (no specific hand)</option>
          {card.categories.map((cat) => (
            <optgroup key={cat} label={cat}>
              {card.hands
                .filter((h) => h.category === cat)
                .map((h) => (
                  <option key={h.id} value={h.id}>
                    {handNotes[h.id] ?? h.notation}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>

        <label className="lbl" style={{ marginTop: 14 }}>
          Note (optional)
        </label>
        <textarea
          className="field"
          rows={2}
          placeholder="Tuesday game with the girls…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <label className="lbl" style={{ marginTop: 14 }}>
          Photo (optional)
        </label>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} />
        {previewUrl ? (
          <div className="win" style={{ marginTop: 4 }}>
            <img className="photo" src={previewUrl} alt="Preview" />
          </div>
        ) : null}
        <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? 'Processing…' : previewUrl ? 'Change photo' : '📷 Add photo'}
        </button>

        <button
          type="button"
          onClick={() => setShareToGroup((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            width: '100%',
            marginTop: 14,
            padding: '12px 14px',
            borderRadius: 14,
            background: shareToGroup ? '#DFF6EF' : '#fff',
            border: `1.5px solid ${shareToGroup ? '#16C098' : 'var(--hairline)'}`,
          }}
        >
          <span style={{ fontSize: 20 }}>👥</span>
          <span style={{ flex: 1, textAlign: 'left', fontWeight: 800, fontSize: 14 }}>
            Share to {groupName}
          </span>
          <span
            aria-hidden
            style={{
              width: 44,
              height: 26,
              borderRadius: 999,
              background: shareToGroup ? '#16C098' : '#d6deea',
              position: 'relative',
              transition: 'background 0.15s',
              flex: '0 0 auto',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 3,
                left: shareToGroup ? 21 : 3,
                width: 20,
                height: 20,
                borderRadius: 999,
                background: '#fff',
                transition: 'left 0.15s',
              }}
            />
          </span>
        </button>

        <div className="row">
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" onClick={save} disabled={busy}>
            Save win
          </button>
        </div>
      </div>
    </div>
  );
}
