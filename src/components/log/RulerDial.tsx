import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Keyboard, Platform, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import * as Haptics from 'expo-haptics';

import Text from '../ui/Text';
import { colors } from '../../theme/colors';
import { display } from '../../theme/fonts';

type Props = {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  /** Every Nth step is a tall, numbered tick. */
  majorEvery?: number;
};

const PX = 10; // one step
const HEIGHT = 78;
const HAPTIC_GAP_MS = 45;

/**
 * A measuring tape you flick. It is a native horizontal scroll list, so the
 * drag, the glide and the snap all run off the JS thread. Ticks are grouped
 * (one list row per `majorEvery` steps) so a 4,500-step weight range mounts
 * only what is on screen. Major ticks carry their number; the needle is fixed.
 *
 * The parent owns the value. While a finger or a glide is moving the tape,
 * the tape is the source of truth; when it is at rest it follows the prop
 * (typed values, the -/+ buttons, the restored last value).
 */
export default function RulerDial({ value, onChange, min, max, step, majorEvery = 10 }: Props) {
  const [width, setWidth] = useState(0);
  const listRef = useRef<FlatList<number>>(null);
  const moving = useRef(false);
  const emitted = useRef(value);
  const lastHaptic = useRef(0);
  const restTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const decimals = step < 1 ? Math.max(1, Math.round(-Math.log10(step))) : 0;
  const steps = Math.round((max - min) / step);
  const groupW = majorEvery * PX;
  const groups = useMemo(() => Array.from({ length: Math.floor(steps / majorEvery) + 1 }, (_v, i) => i), [steps, majorEvery]);
  const pad = Math.max(0, width / 2 - PX / 2);

  const toOffset = useCallback((v: number) => Math.max(0, Math.min(steps, Math.round((v - min) / step))) * PX, [min, step, steps]);

  // The start position only. This object must stay the same across renders:
  // a new contentOffset on every value change re-positions the list under
  // the finger and kills the drag.
  const initialOffset = useRef({ x: toOffset(value), y: 0 }).current;

  // Android can ignore the initial contentOffset: place the tape once it has a width.
  useEffect(() => {
    if (!width) return;
    const id = requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: toOffset(valueRef.current), animated: false }));
    return () => cancelAnimationFrame(id);
  }, [width, toOffset]);
  useEffect(() => () => { if (restTimer.current) clearTimeout(restTimer.current); }, []);

  // At rest, follow the parent's value.
  useEffect(() => {
    if (!width || moving.current) return;
    if (Math.abs(value - emitted.current) < step / 2) return;
    emitted.current = value;
    listRef.current?.scrollToOffset({ offset: toOffset(value), animated: false });
  }, [value, width, step, toOffset]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!moving.current) return; // a programmatic scroll: the parent already has this value
    const k = Math.max(0, Math.min(steps, Math.round(e.nativeEvent.contentOffset.x / PX)));
    const v = Number((min + k * step).toFixed(decimals));
    if (v === emitted.current) return;
    emitted.current = v;
    const now = Date.now();
    if (Platform.OS !== 'web' && now - lastHaptic.current > HAPTIC_GAP_MS) {
      lastHaptic.current = now;
      Haptics.selectionAsync().catch(() => {});
    }
    onChange(v);
  };

  const settle = () => {
    moving.current = false;
    // The parent may round what we sent (kg to lb and back): line up with it.
    if (Math.abs(valueRef.current - emitted.current) >= step / 2) {
      emitted.current = valueRef.current;
      listRef.current?.scrollToOffset({ offset: toOffset(valueRef.current), animated: true });
    }
  };

  const renderGroup = useCallback(
    ({ item: g }: { item: number }) => {
      const ticks: React.ReactNode[] = [];
      for (let i = 0; i < majorEvery; i += 1) {
        const k = g * majorEvery + i;
        if (k > steps) break;
        const abs = Math.round((min + k * step) / step);
        const major = abs % majorEvery === 0;
        const mid = !major && majorEvery % 2 === 0 && abs % (majorEvery / 2) === 0;
        ticks.push(
          <View key={k} style={[styles.slot, { left: i * PX }]}>
            <View style={major ? styles.tickMajor : mid ? styles.tickMid : styles.tickMinor} />
            {major ? (
              <Text style={styles.label} numberOfLines={1}>
                {Number((min + k * step).toFixed(decimals))}
              </Text>
            ) : null}
          </View>,
        );
      }
      return <View style={{ width: groupW, height: HEIGHT }}>{ticks}</View>;
    },
    [majorEvery, steps, min, step, decimals, groupW],
  );

  return (
    <View style={styles.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <FlatList
          ref={listRef}
          data={groups}
          keyExtractor={(g) => String(g)}
          renderItem={renderGroup}
          horizontal
          showsHorizontalScrollIndicator={false}
          getItemLayout={(_d, index) => ({ length: groupW, offset: pad + index * groupW, index })}
          ListHeaderComponent={<View style={{ width: pad }} />}
          ListFooterComponent={<View style={{ width: pad }} />}
          contentOffset={initialOffset}
          snapToInterval={PX}
          decelerationRate="normal"
          scrollEventThrottle={16}
          onScroll={onScroll}
          onScrollBeginDrag={() => {
            if (restTimer.current) clearTimeout(restTimer.current);
            moving.current = true;
            Keyboard.dismiss();
          }}
          onScrollEndDrag={() => {
            // A release with no glide and no snap never fires a momentum
            // event: settle shortly after unless one starts.
            if (restTimer.current) clearTimeout(restTimer.current);
            restTimer.current = setTimeout(settle, 150);
          }}
          onMomentumScrollBegin={() => {
            if (restTimer.current) clearTimeout(restTimer.current);
            moving.current = true;
          }}
          onMomentumScrollEnd={settle}
          initialNumToRender={Math.ceil(width / groupW) + 4}
          windowSize={7}
          maxToRenderPerBatch={8}
          removeClippedSubviews={false}
          nestedScrollEnabled
        />
      ) : null}
      {/* Fixed needle with a notch on top, in the accent. */}
      <View pointerEvents="none" style={[styles.needle, { left: width / 2 - 1.5 }]} />
      <View pointerEvents="none" style={[styles.notch, { left: width / 2 - 6 }]} />
      {/* Edges fall away so the tape reads as longer than the screen. */}
      <View pointerEvents="none" style={[styles.fade, { left: 0, opacity: 0.85, width: 14 }]} />
      <View pointerEvents="none" style={[styles.fade, { left: 14, opacity: 0.55, width: 16 }]} />
      <View pointerEvents="none" style={[styles.fade, { left: 30, opacity: 0.25, width: 18 }]} />
      <View pointerEvents="none" style={[styles.fade, { right: 0, opacity: 0.85, width: 14 }]} />
      <View pointerEvents="none" style={[styles.fade, { right: 14, opacity: 0.55, width: 16 }]} />
      <View pointerEvents="none" style={[styles.fade, { right: 30, opacity: 0.25, width: 18 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: HEIGHT, marginTop: 6 },
  slot: { position: 'absolute', top: 0, width: PX, height: HEIGHT, alignItems: 'center', overflow: 'visible' },
  tickMinor: { marginTop: 10, width: 2, height: 14, borderRadius: 1, backgroundColor: colors.faint },
  tickMid: { marginTop: 10, width: 2, height: 22, borderRadius: 1, backgroundColor: colors.textMuted },
  tickMajor: { marginTop: 10, width: 2, height: 34, borderRadius: 1, backgroundColor: colors.textSecondary },
  label: {
    position: 'absolute',
    top: 50,
    left: PX / 2 - 30,
    width: 60,
    textAlign: 'center',
    fontFamily: display.bold,
    fontSize: 16,
    letterSpacing: 0.3,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  needle: { position: 'absolute', top: 4, width: 3, height: 46, borderRadius: 2, backgroundColor: colors.primary },
  notch: { position: 'absolute', top: 0, width: 12, height: 5, borderRadius: 2, backgroundColor: colors.primary },
  fade: { position: 'absolute', top: 0, bottom: 0, backgroundColor: colors.background },
});
