'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FeedPost, GroupMember, Group } from '../lib/social';
import { YOU_ID } from '../lib/social';
import { TOTAL_HANDS } from '../lib/cardData';
import { track } from '../lib/analytics';

interface Props {
  group: Group;
  members: GroupMember[];
  feed: FeedPost[];
  youName: string;
  /** Live stats for the local user, computed from their tracker. */
  youStats: { handsCleared: number; points: number };
  onHidePost: (id: string) => void;
}

function Avatar({ name, color, size = 38 }: { name: string; color: string; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: color,
        color: '#fff',
        display: 'grid',
        placeItems: 'center',
        fontWeight: 900,
        fontSize: size * 0.42,
        flex: '0 0 auto',
      }}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </div>
  );
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

export default function GroupTab({ group, members, feed, youName, youStats, onHidePost }: Props) {
  // Track a feed view once per mount (core-loop metric).
  useEffect(() => {
    void track('feed_viewed', { posts: feed.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [copied, setCopied] = useState(false);

  // Merge live "you" stats into the leaderboard, then rank.
  const ranked = useMemo(() => {
    const withYou = members.map((m) =>
      m.id === YOU_ID
        ? { ...m, name: youName, handsCleared: youStats.handsCleared, points: youStats.points }
        : m,
    );
    return withYou.sort((a, b) => b.handsCleared - a.handsCleared || b.points - a.points);
  }, [members, youName, youStats]);

  const visibleFeed = feed.filter((p) => !p.hidden);

  function copyCode() {
    navigator.clipboard?.writeText(group.inviteCode).then(
      () => {
        setCopied(true);
        void track('invite_code_copied');
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  }

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="screen">
      <header className="app-header" style={{ padding: '12px 2px 4px' }}>
        <h1>{group.name}</h1>
        <p className="sub">Your group’s race to clear all {TOTAL_HANDS} hands.</p>
      </header>

      {/* Invite */}
      <div className="card" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div className="tag">Invite code</div>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '0.04em' }}>{group.inviteCode}</div>
        </div>
        <button className="btn green" style={{ width: 'auto', padding: '10px 16px' }} onClick={copyCode}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Leaderboard */}
      <div className="cat-head">
        <span className="pill" style={{ background: '#E4ECFF', color: '#2F6BFF' }}>
          🏅 Leaderboard
        </span>
        <span className="count">{ranked.length} players</span>
      </div>

      <div className="card" style={{ padding: 8 }}>
        {ranked.map((m, i) => {
          const pct = Math.round((m.handsCleared / TOTAL_HANDS) * 100);
          return (
            <div
              key={m.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 8px',
                borderRadius: 14,
                background: m.id === YOU_ID ? '#E4ECFF' : 'transparent',
              }}
            >
              <div style={{ width: 26, textAlign: 'center', fontWeight: 900, fontSize: 16 }}>
                {medals[i] ?? i + 1}
              </div>
              <Avatar name={m.name} color={m.avatarColor} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>
                  {m.name}
                  {m.id === YOU_ID && <span style={{ color: 'var(--muted)', fontWeight: 700 }}> · you</span>}
                </div>
                <div className="progress" style={{ marginTop: 6, height: 7 }}>
                  <span style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 900, fontSize: 16 }}>
                  {m.handsCleared}
                  <span style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 800 }}>/{TOTAL_HANDS}</span>
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>{m.points} pts</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Feed */}
      <div className="cat-head">
        <span className="pill" style={{ background: '#DFF6EF', color: '#16C098' }}>
          📣 Feed
        </span>
        <span className="count">{visibleFeed.length} wins</span>
      </div>

      {visibleFeed.length === 0 ? (
        <div className="empty">
          <div className="big">📣</div>
          No wins shared yet. Log a win and share it to the group!
        </div>
      ) : (
        visibleFeed.map((p) => <FeedCard key={p.id} post={p} onHide={() => onHidePost(p.id)} />)
      )}

      <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12, fontWeight: 700, marginTop: 24 }}>
        Demo group — group-mates are simulated on-device. Real shared groups arrive with accounts (v2).
      </p>
    </div>
  );
}

function FeedCard({ post, onHide }: { post: FeedPost; onHide: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (!post.photo) return;
    const u = URL.createObjectURL(post.photo);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [post.photo]);

  return (
    <div className="win">
      {url && <img className="photo" src={url} alt="Win photo" />}
      <div className="body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={post.memberName} color={post.avatarColor} size={34} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{post.memberName}</div>
            <div className="when">{timeAgo(post.createdAt)}</div>
          </div>
          <div style={{ position: 'relative' }}>
            <button className="icon-btn" onClick={() => setMenu((v) => !v)} aria-label="Post options">
              ⋯
            </button>
            {menu && (
              <div
                className="card"
                style={{ position: 'absolute', right: 0, top: 38, padding: 6, zIndex: 5, minWidth: 130 }}
              >
                <button
                  className="btn ghost"
                  style={{ fontSize: 13, padding: '8px 10px' }}
                  onClick={() => {
                    onHide();
                    setMenu(false);
                  }}
                >
                  🚫 Report & hide
                </button>
              </div>
            )}
          </div>
        </div>
        {post.handLabel && (
          <p className="note" style={{ fontWeight: 800, marginTop: 10 }}>
            🀄 {post.handLabel}
          </p>
        )}
        {post.note && <p className="note">{post.note}</p>}
      </div>
    </div>
  );
}
