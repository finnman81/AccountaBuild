import { buildGroupCompliancePct } from '../../src/viewmodels/groups';
import type { GroupLog } from '../../src/services/logs';

const log = (uid: string, date: string, type: GroupLog['type'] = 'workout'): GroupLog =>
  ({ id: `${uid}-${date}-${type}`, uid, date, type, ts: null, source: 'self_reported', payload: {} } as any);

describe('buildGroupCompliancePct', () => {
  const week = ['2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02']; // elapsed = Mon..Thu

  it('is 100% when every member logged every elapsed day', () => {
    const members = ['a', 'b'];
    const logs = members.flatMap((u) => week.map((d) => log(u, d)));
    expect(buildGroupCompliancePct(logs, members, week)).toBe(100);
  });

  it('is 50% when half the member-day slots are filled', () => {
    const members = ['a', 'b'];
    // a logs all 4 days, b logs none → 4 / (2*4) = 50%
    const logs = week.map((d) => log('a', d));
    expect(buildGroupCompliancePct(logs, members, week)).toBe(50);
  });

  it('counts a member at most once per day and ignores non-members', () => {
    const members = ['a'];
    const logs = [log('a', '2026-07-02', 'workout'), log('a', '2026-07-02', 'calories'), log('z', '2026-07-02')];
    // a logged 1 of 4 elapsed days → 25%
    expect(buildGroupCompliancePct(logs, members, week)).toBe(25);
  });

  it('ignores logs dated outside the elapsed window', () => {
    const members = ['a'];
    const logs = [log('a', '2026-07-03'), log('a', '2026-06-01')];
    expect(buildGroupCompliancePct(logs, members, week)).toBe(0);
  });

  it('returns 0 with no members or no elapsed days', () => {
    expect(buildGroupCompliancePct([log('a', '2026-07-02')], [], week)).toBe(0);
    expect(buildGroupCompliancePct([log('a', '2026-07-02')], ['a'], [])).toBe(0);
  });
});
