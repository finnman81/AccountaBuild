// subscribePublicUsers must not emit a partial roster: in a group over 10 it
// listens in 10-uid batches, and emitting per batch made teammates vanish and
// come back on every open.
const listeners: Array<{ batch: string[]; next: (snap: any) => void; error: () => void }> = [];

jest.mock('../src/firebase/firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  doc: jest.fn(),
  documentId: jest.fn(() => '__name__'),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  setDoc: jest.fn(),
  where: jest.fn((_f: string, _op: string, batch: string[]) => ({ batch })),
  query: jest.fn((_c: unknown, w: { batch: string[] }) => ({ batch: w.batch })),
  onSnapshot: jest.fn((q: { batch: string[] }, next: (s: any) => void, error: () => void) => {
    listeners.push({ batch: q.batch, next, error });
    return () => {};
  }),
}));

import { subscribePublicUsers } from '../src/services/publicUsers';

const snapOf = (ids: string[]) => ({ docs: ids.map((id) => ({ id, data: () => ({ displayName: id }) })) });

describe('subscribePublicUsers', () => {
  beforeEach(() => {
    listeners.length = 0;
  });

  it('waits for every batch before the first emit', () => {
    const uids = Array.from({ length: 13 }, (_, i) => `u${i}`);
    const seen: number[] = [];
    subscribePublicUsers(uids, (m) => seen.push(Object.keys(m).length));
    expect(listeners).toHaveLength(2);

    listeners[0].next(snapOf(listeners[0].batch));
    expect(seen).toEqual([]); // first batch alone would be a partial roster

    listeners[1].next(snapOf(listeners[1].batch));
    expect(seen).toEqual([13]);

    listeners[0].next(snapOf(listeners[0].batch)); // later updates emit straight away
    expect(seen).toEqual([13, 13]);
  });

  it('counts a failed batch as answered', () => {
    const uids = Array.from({ length: 12 }, (_, i) => `u${i}`);
    const seen: number[] = [];
    subscribePublicUsers(uids, (m) => seen.push(Object.keys(m).length));
    listeners[0].next(snapOf(listeners[0].batch));
    listeners[1].error();
    expect(seen).toEqual([10]);
  });
});
