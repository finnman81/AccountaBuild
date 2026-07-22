import { HYPES, hypeById, hypesOfKind } from '../../src/mmr/../services/hypeCatalog';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const server = require('../../functions/hype-catalog');

describe('hype catalog', () => {
  it('has a useful number of variants with unique ids', () => {
    expect(HYPES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(HYPES.map((h) => h.id)).size).toBe(HYPES.length);
  });

  it('every entry is renderable (emoji, label, title, body with {name})', () => {
    for (const h of HYPES) {
      expect(h.emoji.length).toBeGreaterThan(0);
      expect(h.label.length).toBeGreaterThan(0);
      expect(h.title.length).toBeGreaterThan(0);
      expect(h.body).toContain('{name}');
    }
  });

  it('covers both kinds', () => {
    expect(hypesOfKind('cheer').length).toBeGreaterThanOrEqual(6);
    expect(hypesOfKind('nudge').length).toBeGreaterThanOrEqual(2);
  });

  it('lookup works and rejects unknown ids', () => {
    expect(hypeById('goat')?.emoji).toBe('🐐');
    expect(hypeById('nope')).toBeNull();
    expect(hypeById(null)).toBeNull();
  });
});

/**
 * The client picks; the SERVER renders the push copy. If the two catalogs
 * drift, users pick a hype and the recipient gets fallback wording (or
 * nothing) — so lock them together, same as the dual scorers.
 */
describe('client/server catalog parity', () => {
  it('ids, kinds and copy match exactly', () => {
    expect(server.HYPES.map((h: any) => h.id)).toEqual(HYPES.map((h) => h.id));
    for (const h of HYPES) {
      const s = server.hypeById(h.id);
      expect(s).toBeTruthy();
      expect(s.kind).toBe(h.kind);
      expect(s.emoji).toBe(h.emoji);
      expect(s.title).toBe(h.title);
      expect(s.body).toBe(h.body);
    }
  });

  it('server renders {name} and prefixes the emoji', () => {
    const out = server.renderHype('beast', 'cheer', 'Watto');
    expect(out.title).toBe('💪 Beast mode');
    expect(out.body).toBe('Watto says beast mode 💪');
  });

  it('server REFUSES a hype whose kind does not match the queued type', () => {
    // Otherwise a client could send a nudge labelled 'cheer' to bypass the
    // recipient's allowNudges setting.
    expect(server.renderHype('clock', 'cheer', 'X')).toBeNull();
    expect(server.renderHype('beast', 'nudge', 'X')).toBeNull();
  });

  it('server falls back (null) on unknown ids rather than inventing copy', () => {
    expect(server.renderHype('bogus', 'cheer', 'X')).toBeNull();
    expect(server.renderHype(undefined, 'cheer', 'X')).toBeNull();
  });
});
