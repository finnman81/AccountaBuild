import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

interface TimePickerProps {
  value: string; // HH:mm format (24-hour)
  onChange: (value: string) => void; // Returns HH:mm format (24-hour)
  disabled?: boolean;
}

// Convert 24-hour to 12-hour with AM/PM
function to12Hour(hour24: number): { hour: number; ampm: 'AM' | 'PM' } {
  if (hour24 === 0) return { hour: 12, ampm: 'AM' };
  if (hour24 < 12) return { hour: hour24, ampm: 'AM' };
  if (hour24 === 12) return { hour: 12, ampm: 'PM' };
  return { hour: hour24 - 12, ampm: 'PM' };
}

// Convert 12-hour to 24-hour
function to24Hour(hour12: number, ampm: 'AM' | 'PM'): number {
  if (ampm === 'AM') {
    return hour12 === 12 ? 0 : hour12;
  } else {
    return hour12 === 12 ? 12 : hour12 + 12;
  }
}

interface PickerColumnProps {
  items: (number | string)[];
  selectedValue: number | string;
  onValueChange: (value: number | string) => void;
  disabled?: boolean;
  formatLabel?: (item: number | string) => string;
}

function PickerColumn({ items, selectedValue, onValueChange, disabled, formatLabel }: PickerColumnProps) {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const selectedIndex = items.findIndex((item) => item === selectedValue);
  const scrollOffset = selectedIndex * ITEM_HEIGHT;

  useEffect(() => {
    if (scrollRef.current && selectedIndex >= 0) {
      scrollRef.current.scrollTo({ y: scrollOffset, animated: false });
    }
  }, [selectedIndex, scrollOffset]);

  return (
    <View style={styles.pickerColumn}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        onMomentumScrollEnd={(e) => {
          const offsetY = e.nativeEvent.contentOffset.y;
          const index = Math.round(offsetY / ITEM_HEIGHT);
          const clampedIndex = Math.max(0, Math.min(index, items.length - 1));
          onValueChange(items[clampedIndex]!);
          scrollRef.current?.scrollTo({ y: clampedIndex * ITEM_HEIGHT, animated: true });
        }}
        contentContainerStyle={{
          paddingVertical: ITEM_HEIGHT * 2,
        }}
      >
        {items.map((item, index) => {
          const isSelected = item === selectedValue;
          const label = formatLabel ? formatLabel(item) : String(item);
          return (
            <TouchableOpacity
              key={index}
              style={[styles.pickerItem, { height: ITEM_HEIGHT }]}
              onPress={() => {
                onValueChange(item);
                scrollRef.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: true });
              }}
              disabled={disabled}
            >
              <Text
                variant="titleLarge"
                style={{
                  color: isSelected ? theme.colors.primary : theme.colors.onSurface,
                  opacity: isSelected ? 1 : 0.4,
                  fontWeight: isSelected ? '600' : '400',
                }}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <View style={[styles.pickerOverlay, { backgroundColor: theme.colors.surface }]} pointerEvents="none" />
    </View>
  );
}

export default function TimePicker({ value, onChange, disabled }: TimePickerProps) {
  const theme = useTheme();
  const [hour12, setHour12] = useState(9);
  const [minute, setMinute] = useState(0);
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('AM');
  const isInitialMount = React.useRef(true);

  // Parse value from props
  useEffect(() => {
    const [h, m] = value.split(':').map(Number);
    if (Number.isFinite(h) && Number.isFinite(m)) {
      const { hour, ampm: ap } = to12Hour(h);
      setHour12(hour);
      setMinute(m);
      setAmpm(ap);
    }
    // Mark as initialized after first value parse
    if (isInitialMount.current) {
      isInitialMount.current = false;
    }
  }, [value]);

  // Update parent when user changes time (skip initial mount)
  useEffect(() => {
    if (isInitialMount.current) return;
    const hour24 = to24Hour(hour12, ampm);
    const newValue = `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    onChange(newValue);
  }, [hour12, minute, ampm, onChange]);

  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = Array.from({ length: 60 }, (_, i) => i);
  const ampmOptions: ('AM' | 'PM')[] = ['AM', 'PM'];

  return (
    <View style={[styles.container, disabled && { opacity: 0.5 }]}>
      <View style={[styles.pickerWrapper, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline }]}>
        <PickerColumn
          items={hours}
          selectedValue={hour12}
          onValueChange={(v) => setHour12(v as number)}
          disabled={disabled}
          formatLabel={(h) => String(h).padStart(2, '0')}
        />
        <View style={styles.separator}>
          <Text variant="titleLarge" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>
            :
          </Text>
        </View>
        <PickerColumn
          items={minutes}
          selectedValue={minute}
          onValueChange={(v) => setMinute(v as number)}
          disabled={disabled}
          formatLabel={(m) => String(m).padStart(2, '0')}
        />
        <PickerColumn
          items={ampmOptions}
          selectedValue={ampm}
          onValueChange={(v) => setAmpm(v as 'AM' | 'PM')}
          disabled={disabled}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  pickerWrapper: {
    flexDirection: 'row',
    height: PICKER_HEIGHT,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
  },
  pickerColumn: {
    flex: 1,
    height: PICKER_HEIGHT,
    position: 'relative',
  },
  pickerItem: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerOverlay: {
    position: 'absolute',
    top: ITEM_HEIGHT * 2,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  separator: {
    width: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
