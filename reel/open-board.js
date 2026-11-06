// The opening's board: a claim, and a doubt flapped in after it. Shared by the
// page and the build, which times the sound by the same flaps.
export const OPEN = {
  seed: 7,
  x: 280,
  y: 330,
  rows: [
    { cols: 16, size: 'l', events: [{ at: 0.15, text: 'YOUR AGENT SKILL', stagger: 0.026 }] },
    {
      cols: 16,
      size: 'l',
      space: 10,
      events: [
        { at: 0.32, text: 'WORKS.', stagger: 0.026 },
        { at: 0.95, text: 'WORKS. PROBABLY.', tones: [[7, 16, 'key']], stagger: 0.03, spin: 9 },
      ],
    },
  ],
}
