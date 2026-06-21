'use client';

import { useState } from 'react';

interface Section {
  title: string;
  body: React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    title: '🀄 How to play (the 60-second version)',
    body: (
      <>
        <p>
          American Mahjong is played by four people with 152 tiles. Each year the National Mah Jongg
          League publishes a <strong>card</strong> of ~70 winning hands grouped into categories.
        </p>
        <p>
          You start with 13 tiles and take turns drawing and discarding, racing to build one of the
          hands on the card. Call <em>“Mahjong!”</em> when your 14 tiles match a hand exactly — that
          hand’s point value is yours.
        </p>
        <p>This app is your scorecard: tap a hand each time you win it and watch your card fill in.</p>
      </>
    ),
  },
  {
    title: '🎯 What does “clearing the card” mean?',
    body: (
      <>
        <p>
          The yearlong challenge: win <strong>every hand on the card at least once</strong> before
          next April’s new card drops. It’s the “collect them all” of mahjong.
        </p>
        <p>
          The <strong>Card</strong> tab shows how many of the {`~70`} you’ve cleared, your total
          wins, and your points. Use the <strong>Remaining</strong> filter to see what’s left to
          hunt.
        </p>
      </>
    ),
  },
  {
    title: '📖 Reading the notation',
    body: (
      <>
        <p>Hands are written in shorthand. A few common symbols:</p>
        <ul>
          <li><strong>F</strong> — Flower tile</li>
          <li><strong>D</strong> — Dragon (color matches the suit)</li>
          <li><strong>N E W S</strong> — the wind tiles (North, East, West, South)</li>
          <li><strong>Numbers</strong> — actual number tiles in a suit</li>
          <li><strong>C</strong> badge — the hand must be played <em>concealed</em></li>
        </ul>
        <p>
          The colors here are decorative — they just help your eye group the tiles. The official card
          uses color to show which <em>suit</em> each group must be; tap the ✎ to edit any notation to
          match your card exactly.
        </p>
      </>
    ),
  },
  {
    title: '💡 Tips',
    body: (
      <ul>
        <li>Log the win the moment it happens — before the tiles get scooped up for the next hand.</li>
        <li>Snap a quick photo of a pretty hand; it makes a great share card.</li>
        <li>Chase the <strong>Singles &amp; Pairs</strong> hands when you’re feeling brave — they’re worth the most.</li>
        <li>Use the <strong>Remaining</strong> filter at the start of a session to pick a target.</li>
      </ul>
    ),
  },
  {
    title: '❓ FAQ',
    body: (
      <>
        <p>
          <strong>Is my data private?</strong> Yes — everything lives only on this device. No account,
          no cloud, nothing leaves your phone.
        </p>
        <p>
          <strong>Is this the official NMJL card?</strong> No. This is a sample card so you can try the
          app. You can edit every hand to match your real card, and licensed/official cards are planned.
        </p>
        <p>
          <strong>What happens in April?</strong> A new card comes out each spring. Future versions
          will let you load the new year without losing your history.
        </p>
      </>
    ),
  },
  {
    title: '🎉 Fun facts',
    body: (
      <ul>
        <li>The National Mah Jongg League was founded in 1937 and still issues a new card every year.</li>
        <li>Those little “bams,” “cracks,” and “dots” are the three suits — Bamboo, Characters, and Circles.</li>
        <li>The flowers and jokers are the wild cards that make the wild hands possible.</li>
        <li>“Mah Jongg” roughly translates to “sparrow” — listen for the clatter of tiles, the “twittering of the sparrows.”</li>
      </ul>
    ),
  },
];

export default function LearnTab() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="screen">
      <header className="app-header" style={{ padding: '12px 2px 4px' }}>
        <h1>Learn</h1>
        <p className="sub">New to the card? Start here.</p>
      </header>

      <div style={{ marginTop: 14 }}>
        {SECTIONS.map((s, i) => (
          <div className="acc" key={i} data-open={open === i}>
            <button onClick={() => setOpen(open === i ? null : i)}>
              <span>{s.title}</span>
              <span className="chev">▶</span>
            </button>
            {open === i && <div className="acc-body">{s.body}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
