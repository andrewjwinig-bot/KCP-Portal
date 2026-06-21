'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SAMPLE_CARD } from '../lib/cardData';
import type { Win } from '../lib/types';
import * as db from '../lib/storage';
import * as social from '../lib/social';
import BottomNav, { type Tab } from './BottomNav';
import CardTab from './CardTab';
import WinsTab from './WinsTab';
import GroupTab from './GroupTab';
import LearnTab from './LearnTab';

export default function AppShell() {
  const [tab, setTab] = useState<Tab>('card');
  const [loaded, setLoaded] = useState(false);
  const [handCounts, setHandCounts] = useState<Record<string, number>>({});
  const [handNotes, setHandNotes] = useState<Record<string, string>>({});
  const [wins, setWins] = useState<Win[]>([]);
  const [socialState, setSocialState] = useState<social.SocialState | null>(null);

  // Load all local state once on mount.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [counts, notes, w, s] = await Promise.all([
        db.loadHandCounts(),
        db.loadHandNotes(),
        db.loadWins(),
        social.loadSocial(),
      ]);
      if (!alive) return;
      setHandCounts(counts);
      setHandNotes(notes);
      setWins(w);
      setSocialState(s);
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Live leaderboard stats for the local user, derived from their tracker.
  const youStats = useMemo(() => {
    let handsCleared = 0;
    let points = 0;
    for (const h of SAMPLE_CARD.hands) {
      const c = handCounts[h.id] ?? 0;
      if (c > 0) handsCleared += 1;
      points += c * h.points;
    }
    return { handsCleared, points };
  }, [handCounts]);

  const bumpHand = useCallback((handId: string, delta: number) => {
    setHandCounts((prev) => {
      const next = Math.max(0, (prev[handId] ?? 0) + delta);
      void db.setHandCount(handId, next);
      return { ...prev, [handId]: next };
    });
  }, []);

  const saveNotation = useCallback((handId: string, notation: string) => {
    setHandNotes((prev) => {
      void db.setHandNote(handId, notation);
      return { ...prev, [handId]: notation };
    });
  }, []);

  const addWin = useCallback((win: Win) => {
    setWins((prev) => [win, ...prev]);
    void db.saveWin(win);
  }, []);

  const removeWin = useCallback((id: string) => {
    setWins((prev) => prev.filter((w) => w.id !== id));
    void db.deleteWin(id);
  }, []);

  const postToGroup = useCallback((win: Win) => {
    setSocialState((prev) => {
      if (!prev) return prev;
      const post: social.FeedPost = {
        id: crypto.randomUUID(),
        memberId: social.YOU_ID,
        memberName: prev.youName,
        avatarColor: prev.members.find((m) => m.isYou)?.avatarColor ?? '#2F6BFF',
        handLabel: win.handLabel,
        note: win.note,
        photo: win.photo,
        createdAt: win.createdAt,
      };
      void social.addFeedPost(post);
      return { ...prev, feed: [post, ...prev.feed] };
    });
  }, []);

  const hidePost = useCallback((id: string) => {
    setSocialState((prev) => {
      if (!prev) return prev;
      void social.setFeedHidden(id, true);
      return { ...prev, feed: prev.feed.map((p) => (p.id === id ? { ...p, hidden: true } : p)) };
    });
  }, []);

  return (
    <div className="app">
      {!loaded ? (
        <div className="screen" style={{ display: 'grid', placeItems: 'center' }}>
          <div className="empty">
            <div className="big">🀄</div>
            Loading your card…
          </div>
        </div>
      ) : (
        <>
          {tab === 'card' && (
            <CardTab
              card={SAMPLE_CARD}
              handCounts={handCounts}
              handNotes={handNotes}
              onBump={bumpHand}
              onSaveNotation={saveNotation}
            />
          )}
          {tab === 'wins' && (
            <WinsTab
              card={SAMPLE_CARD}
              handNotes={handNotes}
              wins={wins}
              groupName={socialState?.group.name ?? 'your group'}
              onAddWin={addWin}
              onRemoveWin={removeWin}
              onBump={bumpHand}
              onPostToGroup={postToGroup}
            />
          )}
          {tab === 'group' && socialState && (
            <GroupTab
              group={socialState.group}
              members={socialState.members}
              feed={socialState.feed}
              youName={socialState.youName}
              youStats={youStats}
              onHidePost={hidePost}
            />
          )}
          {tab === 'learn' && <LearnTab />}
        </>
      )}
      <BottomNav tab={tab} onChange={setTab} />
    </div>
  );
}
