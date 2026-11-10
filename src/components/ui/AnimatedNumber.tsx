import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, type StyleProp, type TextStyle } from 'react-native';

import { duration as motionDuration, easing } from '../../theme/motion';

/**
 * Count a number toward `to` and return the whole number to show.
 * Shared by AnimatedNumber and the week review's headline.
 *
 * - `delay` lets a screen start the count after its own transition: a count
 *   that starts while the screen is still fading in fights it and stutters.
 * - Only reports when the rounded value changes, not every frame.
 * - A new target mid-count continues from where the number is, and a
 *   cancelled run never writes its own (stale) target.
 */
export function useCountTo(to: number, opts: { from?: number; duration?: number; animateFirst?: boolean; delay?: number } = {}): number {
  const { duration = motionDuration.count, animateFirst = false, delay = 0 } = opts;
  const start = animateFirst ? opts.from ?? 0 : to;
  const anim = useRef(new Animated.Value(start)).current;
  const shown = useRef(Math.round(start));
  const [display, setDisplay] = useState(shown.current);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (!animateFirst) return;
    }
    const sub = anim.addListener(({ value }) => {
      const next = Math.round(value);
      if (next === shown.current) return;
      shown.current = next;
      setDisplay(next);
    });
    const running = Animated.timing(anim, { toValue: to, duration, delay, easing: easing.enter, useNativeDriver: false });
    running.start(({ finished }) => {
      if (!finished) return;
      shown.current = Math.round(to);
      setDisplay(shown.current);
    });
    return () => {
      running.stop();
      anim.removeListener(sub);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to]);

  return display;
}

/**
 * A number that COUNTS to its new value instead of hard-flashing when a stale
 * cached value is replaced by the live one (Firestore delivers cache first,
 * and the server recomputes FP every 6h, so the first paint is often old).
 * First render is instant; only changes animate.
 */
export default function AnimatedNumber({
  value,
  style,
  duration,
}: {
  value: number;
  style?: StyleProp<TextStyle>;
  duration?: number;
}) {
  const display = useCountTo(value, { duration });
  return <Text style={style}>{display.toLocaleString()}</Text>;
}
