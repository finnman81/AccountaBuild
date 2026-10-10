import { feetInchesError, joinFeetInches, splitInches } from '../../src/utils/height';

describe('height feet/inches', () => {
  it('splits total inches', () => {
    expect(splitInches(70)).toEqual({ ft: '5', inches: '10' });
    expect(splitInches(71.9)).toEqual({ ft: '6', inches: '0' });
    expect(splitInches(null)).toEqual({ ft: '', inches: '' });
  });
  it('joins, blank inches = 0', () => {
    expect(joinFeetInches('5', '10')).toBe(70);
    expect(joinFeetInches('6', '')).toBe(72);
    expect(joinFeetInches('', '10')).toBeNull();
  });
  it('validates', () => {
    expect(feetInchesError('5', '10')).toBeNull();
    expect(feetInchesError('5', '12')).toMatch(/0 to 11/);
    expect(feetInchesError('3', '0')).toMatch(/between/);
    expect(feetInchesError('', '')).toMatch(/required/);
  });
});
