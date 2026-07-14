import React, { useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { doc, onSnapshot } from 'firebase/firestore';

import { db } from '../../firebase/firebase';
import { colors } from '../../theme/colors';

/**
 * "A new version is available" banner for OLD NATIVE BUILDS.
 *
 * OTA updates keep every build's JS current, so we can't tell builds apart by
 * JS version — instead we feature-probe a native module that only newer builds
 * ship (Skia, added in iOS 34 / Android vc14). Old builds fail the probe and
 * see the banner; new builds never do.
 *
 * Remote-controlled via config/app in Firestore:
 *   { showUpdateBanner: true, updateMessage: '…', iosUpdateUrl: '…', androidUpdateUrl: '…' }
 * so the copy/links/kill-switch are editable without shipping anything.
 */
function hasNewNativeModules(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('@shopify/react-native-skia');
    return true;
  } catch {
    return false;
  }
}

type AppConfig = {
  showUpdateBanner?: boolean;
  updateMessage?: string;
  iosUpdateUrl?: string;
  androidUpdateUrl?: string;
};

export default function UpdateBanner() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [isOldBuild] = useState(() => !hasNewNativeModules());

  useEffect(() => {
    if (!isOldBuild) return;
    return onSnapshot(
      doc(db, 'config', 'app'),
      (snap) => setConfig(snap.exists() ? (snap.data() as AppConfig) : null),
      () => setConfig(null),
    );
  }, [isOldBuild]);

  if (!isOldBuild || !config?.showUpdateBanner) return null;

  const url = Platform.OS === 'ios' ? config.iosUpdateUrl : config.androidUpdateUrl;
  const open = () => {
    if (url) void Linking.openURL(url).catch(() => {});
  };

  return (
    <TouchableOpacity style={styles.wrap} activeOpacity={url ? 0.85 : 1} onPress={open} disabled={!url}>
      <View style={styles.iconWrap}>
        <Icon source="arrow-up-circle" size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>New version available</Text>
        <Text style={styles.body}>
          {config.updateMessage || (Platform.OS === 'ios' ? 'Update in TestFlight for the latest features.' : 'Update in the Play Store for the latest features.')}
        </Text>
      </View>
      {url ? <Icon source="chevron-right" size={20} color={colors.textMuted} /> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: 'rgba(62,139,255,0.35)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  iconWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  body: { color: colors.textSecondary, fontSize: 12, marginTop: 1, lineHeight: 16 },
});
