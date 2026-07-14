import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, type StyleProp, type TextStyle } from 'react-native';

/**
 * A number that COUNTS to its new value instead of hard-flashing when a stale
 * cached value is replaced by the live one (Firestore delivers cache first,
 * and the server recomputes FP every 6h, so the first paint is often old).
 * First render is instant; only changes animate.
 */
export default function AnimatedNumber({
  value,
  style,
  duration = 600,
}: {
  value: number;
  style?: StyleProp<TextStyle>;
  duration?: number;
}) {
  const anim = useRef(new Animated.Value(value)).current;
  const [display, setDisplay] = useState(Math.round(value));
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      anim.setValue(value);
      setDisplay(Math.round(value));
      return;
    }
    const sub = anim.addListener(({ value: v }) => setDisplay(Math.round(v)));
    Animated.timing(anim, { toValue: value, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(() => {
      anim.removeListener(sub);
      setDisplay(Math.round(value));
    });
    return () => anim.removeListener(sub);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <Text style={style}>{display.toLocaleString()}</Text>;
}
