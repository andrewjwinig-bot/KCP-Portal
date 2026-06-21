// Lightweight, local-only analytics. Phase 1's single most important signal is:
// HOW OFTEN DOES A WIN GET SHARED? (validates the social thesis cheaply.)
//
// No network, no third party — we just keep a durable on-device counter + a
// rolling event log. When a backend exists (v2+), this is the hook to forward
// these events to a real analytics sink.

import { getMeta, setMeta } from './storage';

const KEY_SHARE_COUNT = 'analytics.shareCount';
const KEY_EVENTS = 'analytics.events';

export interface AnalyticsEvent {
  name: string;
  at: number;
  props?: Record<string, unknown>;
}

export async function track(name: string, props?: Record<string, unknown>): Promise<void> {
  try {
    const events = await getMeta<AnalyticsEvent[]>(KEY_EVENTS, []);
    events.push({ name, at: Date.now(), props });
    // keep the log bounded
    await setMeta(KEY_EVENTS, events.slice(-500));
  } catch {
    /* analytics must never break the app */
  }
  if (typeof console !== 'undefined') console.debug('[analytics]', name, props ?? '');
}

/** The headline Phase-1 metric. Call when a win's "Share card" is used. */
export async function recordShare(handLabel: string | null): Promise<number> {
  const next = (await getMeta<number>(KEY_SHARE_COUNT, 0)) + 1;
  await setMeta(KEY_SHARE_COUNT, next);
  await track('win_shared', { handLabel, total: next });
  return next;
}

export function getShareCount(): Promise<number> {
  return getMeta<number>(KEY_SHARE_COUNT, 0);
}
