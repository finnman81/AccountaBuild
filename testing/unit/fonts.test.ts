import { resolveFont } from '../../src/theme/fonts';

describe('resolveFont', () => {
  it('maps a weight to its Inter file and drops the weight', () => {
    expect(resolveFont({ fontWeight: '700' })).toEqual({ fontFamily: 'Inter_700Bold', fontWeight: 'normal' });
    expect(resolveFont({ fontWeight: 'bold' })).toEqual({ fontFamily: 'Inter_700Bold', fontWeight: 'normal' });
    expect(resolveFont({ fontWeight: '900' })?.fontFamily).toBe('Inter_800ExtraBold');
    expect(resolveFont({ fontSize: 12 })?.fontFamily).toBe('Inter_400Regular');
    expect(resolveFont(undefined)?.fontFamily).toBe('Inter_400Regular');
  });

  it('keeps one of our families and only drops the weight', () => {
    expect(resolveFont({ fontFamily: 'BarlowCondensed_800ExtraBold', fontWeight: '800' })).toEqual({ fontWeight: 'normal' });
  });

  it('leaves other families and bare Paper variants alone', () => {
    expect(resolveFont({ fontFamily: 'monospace', fontWeight: '700' })).toBeNull();
    expect(resolveFont({ fontSize: 12 }, true)).toBeNull();
    expect(resolveFont({ fontWeight: '600' }, true)?.fontFamily).toBe('Inter_600SemiBold');
  });
});
