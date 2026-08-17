import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

/**
 * The healing-pod treatment for a hibernating member: a teal glass dome, a
 * breathing tube and two sensor leads, and a few rising bubbles — drawn OVER
 * the member's real avatar rather than replacing it, so the row still reads as
 * "that's Nick, in the tank" instead of "some stranger's picture".
 *
 * Original vector art on purpose. The look is a genre staple (sci-fi medical
 * pod), the specific artwork is ours, which keeps the App Store content-rights
 * declaration true.
 *
 * Pure SVG, no animation: this renders in leaderboard rows and the Today rail
 * where dozens can be on screen, and a looping animation per row is a battery
 * and jank tax for a joke that lands fine standing still.
 */
export default function HibernationPod({ size }: { size: number }) {
  const s = size;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: s, height: s }}>
      <Svg width={s} height={s} viewBox="0 0 100 100">
        <Defs>
          {/* Fluid: heaviest at the bottom, so the face stays readable. */}
          <LinearGradient id="pod-fluid" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#2EE6C5" stopOpacity="0.22" />
            <Stop offset="0.55" stopColor="#12B5A6" stopOpacity="0.42" />
            <Stop offset="1" stopColor="#0A6E7E" stopOpacity="0.66" />
          </LinearGradient>
          {/* Curved glass highlight across the upper-left. */}
          <LinearGradient id="pod-glass" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.34" />
            <Stop offset="0.42" stopColor="#FFFFFF" stopOpacity="0.05" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </LinearGradient>
          <RadialGradient id="pod-vignette" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0.6" stopColor="#000000" stopOpacity="0" />
            <Stop offset="1" stopColor="#02343B" stopOpacity="0.55" />
          </RadialGradient>
        </Defs>

        <Circle cx="50" cy="50" r="50" fill="url(#pod-fluid)" />
        <Circle cx="50" cy="50" r="50" fill="url(#pod-vignette)" />

        {/* Breathing tube: down from the top, curving to the mouth. */}
        <Path d="M50 0 L50 26 Q50 38 42 44" stroke="#DFF7F2" strokeOpacity="0.72" strokeWidth="4.5" fill="none" strokeLinecap="round" />
        <Path d="M50 0 L50 26 Q50 38 42 44" stroke="#0A6E7E" strokeOpacity="0.35" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <Ellipse cx="41" cy="45" rx="6" ry="4.5" fill="#DFF7F2" fillOpacity="0.66" />

        {/* Sensor leads + electrodes. */}
        <Path d="M12 34 Q26 30 33 36" stroke="#DFF7F2" strokeOpacity="0.5" strokeWidth="2" fill="none" strokeLinecap="round" />
        <Circle cx="33" cy="36" r="3.4" fill="#DFF7F2" fillOpacity="0.7" />
        <Path d="M88 42 Q74 38 68 44" stroke="#DFF7F2" strokeOpacity="0.5" strokeWidth="2" fill="none" strokeLinecap="round" />
        <Circle cx="68" cy="44" r="3.4" fill="#DFF7F2" fillOpacity="0.7" />

        {/* Bubbles, small to large as they rise. */}
        <Circle cx="24" cy="70" r="3.2" fill="#EAFFFB" fillOpacity="0.5" />
        <Circle cx="30" cy="56" r="2.2" fill="#EAFFFB" fillOpacity="0.4" />
        <Circle cx="72" cy="66" r="2.6" fill="#EAFFFB" fillOpacity="0.45" />
        <Circle cx="78" cy="78" r="4" fill="#EAFFFB" fillOpacity="0.35" />
        <Circle cx="58" cy="84" r="2.4" fill="#EAFFFB" fillOpacity="0.4" />

        <Circle cx="50" cy="50" r="50" fill="url(#pod-glass)" />
        {/* Rim: the pod's edge. */}
        <Circle cx="50" cy="50" r="48.6" stroke="#5FF0DC" strokeOpacity="0.5" strokeWidth="2.6" fill="none" />
      </Svg>
    </View>
  );
}
