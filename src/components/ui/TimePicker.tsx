import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Button, Modal, Portal, Text, useTheme } from 'react-native-paper';

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

interface TimePickerProps {
  value: string; // HH:mm format (24-hour)
  onChange: (value: string) => void; // Returns HH:mm format (24-hour)
  disabled?: boolean;
  label?: string;
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

// Format time for display
function formatTimeDisplay(hour24: number, minute: number, ampm: 'AM' | 'PM'): string {
  const { hour } = to12Hour(hour24);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${ampm}`;
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
  const isScrolling = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initial scroll to selected value
  useEffect(() => {
    if (scrollRef.current && selectedIndex >= 0 && !isScrolling.current) {
      scrollRef.current.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
    }
  }, [selectedIndex]);

  const handleScrollEnd = (e: any) => {
    // Clear any pending timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = null;
    }

    // Snapshot offset synchronously (synthetic event pooling)
    const offsetY = e?.nativeEvent?.contentOffset?.y;
    if (typeof offsetY !== 'number') {
      isScrolling.current = false;
      return;
    }

    // Use requestAnimationFrame to ensure smooth updates
    requestAnimationFrame(() => {
      isScrolling.current = false;
      const index = Math.round(offsetY / ITEM_HEIGHT);
      const clampedIndex = Math.max(0, Math.min(index, items.length - 1));
      const newValue = items[clampedIndex];

      // Only update if value actually changed
      if (newValue !== selectedValue) {
        onValueChange(newValue);
      }

      // Smooth scroll to exact position
      scrollRef.current?.scrollTo({ y: clampedIndex * ITEM_HEIGHT, animated: true });
    });
  };

  const handleScrollBegin = () => {
    isScrolling.current = true;
    // Clear any pending timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
  };

  const handleScroll = () => {
    // Debounce rapid scroll events
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    scrollTimeoutRef.current = setTimeout(() => {
      isScrolling.current = false;
    }, 150);
  };

  const handleItemPress = (item: number | string, index: number) => {
    if (isScrolling.current) return; // Prevent taps during scroll
    
    onValueChange(item);
    scrollRef.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: true });
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  return (
    <View style={styles.pickerColumn}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        onScrollBeginDrag={handleScrollBegin}
        onMomentumScrollEnd={handleScrollEnd}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingVertical: ITEM_HEIGHT * 2,
        }}
      >
        {items.map((item, index) => {
          const isSelected = item === selectedValue;
          const label = formatLabel ? formatLabel(item) : String(item);
          const distanceFromSelected = Math.abs(index - selectedIndex);
          const opacity = isSelected ? 1 : Math.max(0.4, 1 - distanceFromSelected * 0.2);
          
          return (
            <TouchableOpacity
              key={`${item}-${index}`}
              style={[styles.pickerItem, { height: ITEM_HEIGHT }]}
              onPress={() => handleItemPress(item, index)}
              disabled={disabled}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.pickerItemContent,
                  isSelected && {
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    borderRadius: 8,
                  }
                ]}
              >
                <Text
                  variant="titleLarge"
                  style={{
                    color: isSelected ? theme.colors.primary : theme.colors.onSurface,
                    opacity,
                    fontWeight: isSelected ? '700' : '500',
                    fontSize: isSelected ? 20 : 17,
                  }}
                >
                  {label}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {/* Fade overlays */}
      <View 
        style={[styles.fadeOverlayTop, { backgroundColor: theme.colors.surface }]} 
        pointerEvents="none" 
      />
      <View 
        style={[styles.fadeOverlayBottom, { backgroundColor: theme.colors.surface }]} 
        pointerEvents="none" 
      />
    </View>
  );
}

export default function TimePicker({ value, onChange, disabled, label }: TimePickerProps) {
  const theme = useTheme();
  const [modalVisible, setModalVisible] = useState(false);
  const [tempHour12, setTempHour12] = useState(9);
  const [tempMinute, setTempMinute] = useState(0);
  const [tempAmpm, setTempAmpm] = useState<'AM' | 'PM'>('AM');

  // Parse value from props
  useEffect(() => {
    const [h, m] = value.split(':').map(Number);
    if (Number.isFinite(h) && Number.isFinite(m)) {
      const { hour, ampm: ap } = to12Hour(h);
      setTempHour12(hour);
      setTempMinute(m);
      setTempAmpm(ap);
    }
  }, [value]);

  // When modal opens, sync temp values with current value
  useEffect(() => {
    if (modalVisible) {
      const [h, m] = value.split(':').map(Number);
      if (Number.isFinite(h) && Number.isFinite(m)) {
        const { hour, ampm: ap } = to12Hour(h);
        setTempHour12(hour);
        setTempMinute(m);
        setTempAmpm(ap);
      }
    }
  }, [modalVisible, value]);

  const handleConfirm = () => {
    const hour24 = to24Hour(tempHour12, tempAmpm);
    const newValue = `${String(hour24).padStart(2, '0')}:${String(tempMinute).padStart(2, '0')}`;
    onChange(newValue);
    setModalVisible(false);
  };

  const handleCancel = () => {
    // Reset to original value
    const [h, m] = value.split(':').map(Number);
    if (Number.isFinite(h) && Number.isFinite(m)) {
      const { hour, ampm: ap } = to12Hour(h);
      setTempHour12(hour);
      setTempMinute(m);
      setTempAmpm(ap);
    }
    setModalVisible(false);
  };

  const [h, m] = value.split(':').map(Number);
  const displayTime = Number.isFinite(h) && Number.isFinite(m) 
    ? formatTimeDisplay(h, m, to12Hour(h).ampm)
    : '09:00 AM';

  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = Array.from({ length: 60 }, (_, i) => i);
  const ampmOptions: ('AM' | 'PM')[] = ['AM', 'PM'];

  return (
    <>
      <TouchableOpacity
        onPress={() => !disabled && setModalVisible(true)}
        disabled={disabled}
        style={[
          styles.timeButton,
          {
            backgroundColor: theme.colors.surfaceVariant,
            borderColor: theme.colors.outline,
            opacity: disabled ? 0.5 : 1,
          }
        ]}
      >
        <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
          {displayTime}
        </Text>
      </TouchableOpacity>

      <Portal>
        <Modal
          visible={modalVisible}
          onDismiss={handleCancel}
          contentContainerStyle={[
            styles.modalContent,
            { backgroundColor: theme.colors.surface }
          ]}
        >
          <View style={styles.modalHeader}>
            <Text variant="titleLarge" style={{ color: theme.colors.onSurface }}>
              {label || 'Select Time'}
            </Text>
          </View>

          <View style={[
            styles.pickerWrapper,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }
          ]}>
            <PickerColumn
              items={hours}
              selectedValue={tempHour12}
              onValueChange={(v) => setTempHour12(v as number)}
              formatLabel={(h) => String(h).padStart(2, '0')}
            />
            <View style={styles.separator}>
              <Text variant="titleLarge" style={{ color: theme.colors.onSurface, fontWeight: '600', fontSize: 20 }}>
                :
              </Text>
            </View>
            <PickerColumn
              items={minutes}
              selectedValue={tempMinute}
              onValueChange={(v) => setTempMinute(v as number)}
              formatLabel={(m) => String(m).padStart(2, '0')}
            />
            <PickerColumn
              items={ampmOptions}
              selectedValue={tempAmpm}
              onValueChange={(v) => setTempAmpm(v as 'AM' | 'PM')}
            />
          </View>

          <View style={styles.modalActions}>
            <Button mode="text" onPress={handleCancel}>
              Cancel
            </Button>
            <Button mode="contained" onPress={handleConfirm}>
              Done
            </Button>
          </View>
        </Modal>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  timeButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 48,
    justifyContent: 'center',
  },
  modalContent: {
    margin: 20,
    borderRadius: 16,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    marginBottom: 20,
    alignItems: 'center',
  },
  pickerWrapper: {
    flexDirection: 'row',
    height: PICKER_HEIGHT,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    marginBottom: 20,
  },
  pickerColumn: {
    flex: 1,
    height: PICKER_HEIGHT,
    position: 'relative',
  },
  pickerItem: {
    justifyContent: 'center',
    alignItems: 'center',
    height: ITEM_HEIGHT,
  },
  pickerItemContent: {
    width: '90%',
    height: '80%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fadeOverlayTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT * 2,
    zIndex: 1,
  },
  fadeOverlayBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT * 2,
    zIndex: 1,
  },
  separator: {
    width: 16,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
});
