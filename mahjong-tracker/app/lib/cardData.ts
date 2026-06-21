import type { MahjongCard, Hand } from './types';

/**
 * ⚠️ PLACEHOLDER CARD — NOT the official National Mah Jongg League card.
 *
 * The real NMJL card is licensed IP. Reproducing it is an open licensing question
 * to resolve before the cloud/social version (see plan). For Phase 1 this is a
 * structurally-faithful SAMPLE so the app's design + mechanics can be validated.
 * The notations below are illustrative only.
 *
 * Everything here is plain DATA on purpose: a future version swaps this for a
 * licensed card or a user-entered/photographed one with zero app-code changes.
 */

type Seed = [notation: string, points: number, concealed: boolean];

// Categories + ordering mirror a printed 2026 hand tracker. Notations are
// original illustrative placeholders — NOT copied from the official card.
const SEED: Record<string, Seed[]> = {
  '2026': [
    ['222 000 2222 6666', 25, false],
    ['2026 DDD 2222 DDD', 25, false],
    ['FFF 2026 222 6666', 25, false],
    ['22 00 222 666 NEWS', 30, false],
  ],
  '2468': [
    ['222 444 6666 8888', 25, false],
    ['2222 444 6666 8888', 25, false],
    ['FF 2222 44 66 8888', 30, false],
    ['EE 22 444 666 88 WW', 30, false],
    ['2222 DDD 8888 DDD', 25, false],
    ['FFF 22 44 666 8888', 25, false],
    ['2468 2222 D 2222 D', 30, false],
    ['FFFF 2468 FFF 2222', 30, false],
    ['FF 246 888 246 888', 30, true],
  ],
  'Any Like Numbers': [
    ['1111 FFFFF 1111', 30, false],
    ['1111 D 111 D 1111 D', 25, false],
    ['FF 1111 11 1111 DD', 25, false],
  ],
  'Quints': [
    ['11111 1111 11111', 40, false],
    ['FF 11111 22 33333', 45, false],
    ['11111 44444 DDDD', 40, false],
  ],
  'Consecutive Run': [
    ['11 222 33 444 5555', 25, false],
    ['55 666 77 888 9999', 25, false],
    ['FFF 1111 234 5555', 25, false],
    ['FFF 1111 234 5555', 25, true],
    ['11 22 111 222 3333', 25, false],
    ['111 222 3333 4444', 25, false],
    ['111 222 3333 4444', 25, true],
    ['FFF 11 22 333 DDDD', 25, false],
    ['FFF 11 22 333 DDDD', 25, false],
    ['1111 FFFFF 2222', 30, false],
    ['FF 1111 2222 3333', 25, false],
    ['1 22 333 1 22 333 44', 35, true],
  ],
  '13579': [
    ['11 333 55 777 9999', 25, false],
    ['11 333 55 777 9999', 25, false],
    ['111 333 3333 5555', 25, false],
    ['555 777 7777 9999', 30, false],
    ['NN 1111 33 5555 SS', 30, false],
    ['NN 5555 77 9999 SS', 25, false],
    ['13579 1111 1111', 25, false],
    ['FFF 11 33 555 DDDD', 25, false],
    ['FFF 55 77 999 DDDD', 25, false],
    ['11 33 111 333 5555', 25, false],
    ['55 77 555 777 9999', 30, false],
    ['1111 33 55 77 9999', 30, false],
    ['11 33 55 77 9999', 35, true],
    ['FF 135 777 999 DDD', 30, true],
  ],
  'Winds + Dragons': [
    ['NNNN EEE WWW SSSS', 25, false],
    ['NNN EEEE WWW SSS', 25, false],
    ['1234 DDD DDD DDDD', 25, false],
    ['NNN 1111 1111 SSS', 25, false],
    ['EEE 2222 2222 WWW', 25, false],
    ['FFF NNNN FFF DDDD', 25, false],
    ['1 N 2 EE 3 WWW 4 SSS', 25, false],
    ['FF NNNN SSSS DD DD', 25, false],
    ['FF EEEE WWWW DD DD', 25, false],
    ['NN EEE 2026 WWW SS', 30, true],
  ],
  '369': [
    ['333 666 6666 9999', 25, false],
    ['333 666 6666 9999', 25, false],
    ['33 66 333 666 9999', 25, false],
    ['FFF 33 666 99 DDDD', 25, false],
    ['FFF 33 666 99 NEWS', 30, false],
    ['33 66 666 999 3333', 25, false],
    ['FF 333 666 999 369', 30, true],
  ],
  'Singles + Pairs': [
    ['NN EE WW SS 1D 1D 1D', 50, true],
    ['2 4 66 88 2 4 66 88 88', 50, true],
    ['FF 3369 3669 3699', 50, true],
    ['11 22 33 44 55 66 77', 50, true],
    ['11 357 99 11 357 99', 50, true],
    ['FF 2026 NN EE WW SS', 60, true],
    ['369 11 22 33 369 44', 55, true],
    ['1 2 3 4 5 6 7 8 9 DD', 75, true],
  ],
};

function build(): MahjongCard {
  const categories = Object.keys(SEED);
  const hands: Hand[] = [];
  for (const category of categories) {
    SEED[category].forEach(([notation, points, concealed], i) => {
      hands.push({ id: `${category}-${i}`, category, notation, points, concealed });
    });
  }
  return { year: 2026, source: 'sample', categories, hands };
}

export const SAMPLE_CARD: MahjongCard = build();
export const TOTAL_HANDS = SAMPLE_CARD.hands.length; // 70
