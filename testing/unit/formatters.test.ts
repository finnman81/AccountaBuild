import { formatDeltaLb, formatMinutesHM, formatTimeAgo, formatWeightLb, friendlyNameFromDisplayName } from '../../src/utils/formatters';

describe('formatters', () => {
  test('friendlyNameFromDisplayName prefers display name, strips email', () => {
    expect(friendlyNameFromDisplayName('Jake', 'abc123')).toBe('Jake');
    expect(friendlyNameFromDisplayName('jake@gmail.com', 'abc123')).toBe('jake');
    expect(friendlyNameFromDisplayName('', 'abcdef123')).toBe('abcdef');
  });

  test('formatWeightLb formats ints and decimals', () => {
    expect(formatWeightLb(189)).toBe('189 lb');
    expect(formatWeightLb(189.25)).toBe('189.3 lb');
    expect(formatWeightLb(null)).toBe('—');
  });

  test('formatMinutesHM switches to hours over 60m', () => {
    expect(formatMinutesHM(0)).toBe('0m');
    expect(formatMinutesHM(59)).toBe('59m');
    expect(formatMinutesHM(60)).toBe('1h 0m');
    expect(formatMinutesHM(67)).toBe('1h 7m');
  });

  test('formatDeltaLb includes sign', () => {
    expect(formatDeltaLb(1.2)).toBe('+1.2 lb');
    expect(formatDeltaLb(-1.25)).toBe('-1.3 lb');
    expect(formatDeltaLb(null)).toBe('—');
  });

  test('formatTimeAgo returns stable formats', () => {
    expect(formatTimeAgo(null)).toBe('—');
    // Just sanity-check output shape for recent times.
    expect(formatTimeAgo(Date.now() - 10_000)).toMatch(/ago$/);
  });
});

