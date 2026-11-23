import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { fontFamilies, useThemedStyles, type AppTheme } from '@/src/theme';
import { Text, TextInput } from '@/src/components/common';

interface BirthDatePickerProps {
  maximumDate: Date;
  onCancel: () => void;
  onConfirm: (date: Date) => void;
  value: Date;
  visible: boolean;
}

const twoDigits = (value: number) => String(value).padStart(2, '0');

export function BirthDatePicker({
  maximumDate,
  onCancel,
  onConfirm,
  value,
  visible,
}: BirthDatePickerProps) {
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      {visible ? (
        <BirthDateDialog
          maximumDate={maximumDate}
          onCancel={onCancel}
          onConfirm={onConfirm}
          value={value}
        />
      ) : null}
    </Modal>
  );
}

function BirthDateDialog({
  maximumDate,
  onCancel,
  onConfirm,
  value,
}: Omit<BirthDatePickerProps, 'visible'>) {
  const styles = useThemedStyles(createStyles);
  const [year, setYear] = useState(() => String(value.getFullYear()));
  const [month, setMonth] = useState(() => twoDigits(value.getMonth() + 1));
  const [day, setDay] = useState(() => twoDigits(value.getDate()));
  const parsedYear = Number(year);
  const parsedMonth = Number(month);
  const parsedDay = Number(day);
  const selectedDate = new Date(parsedYear, parsedMonth - 1, parsedDay);
  const isValidDate =
    year.length === 4 &&
    month.length > 0 &&
    day.length > 0 &&
    selectedDate.getFullYear() === parsedYear &&
    selectedDate.getMonth() === parsedMonth - 1 &&
    selectedDate.getDate() === parsedDay &&
    selectedDate <= maximumDate;

  return (
    <View style={styles.overlay}>
      <View style={styles.dialog}>
        <Text style={styles.title}>생년월일 선택</Text>
        <View style={styles.dateFields}>
          <TextInput
            keyboardType="number-pad"
            maxLength={4}
            onChangeText={(text) => setYear(text.replace(/\D/g, ''))}
            style={styles.yearField}
            value={year}
          />
          <Text style={styles.separator}>.</Text>
          <TextInput
            keyboardType="number-pad"
            maxLength={2}
            onChangeText={(text) => setMonth(text.replace(/\D/g, ''))}
            style={styles.dateField}
            value={month}
          />
          <Text style={styles.separator}>.</Text>
          <TextInput
            keyboardType="number-pad"
            maxLength={2}
            onChangeText={(text) => setDay(text.replace(/\D/g, ''))}
            style={styles.dateField}
            value={day}
          />
        </View>
        <View style={styles.actions}>
          <Pressable onPress={onCancel} style={styles.action}>
            <Text style={styles.cancel}>취소</Text>
          </Pressable>
          <Pressable
            disabled={!isValidDate}
            onPress={() => onConfirm(selectedDate)}
            style={styles.action}
          >
            <Text style={[styles.confirm, !isValidDate && styles.disabled]}>완료</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function createStyles({ colors }: AppTheme) {
  const box = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: fontFamilies.galmuri11Bold,
    fontSize: 24,
    height: 52,
    padding: 0,
    textAlign: 'center',
  } as const;
  const word = { fontFamily: fontFamilies.galmuri14, fontSize: 15, lineHeight: 21 } as const;
  return {
    overlay: {
      alignItems: 'center',
      backgroundColor: 'rgba(22, 24, 46, 0.45)',
      flex: 1,
      justifyContent: 'center',
      padding: 24,
    },
    dialog: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 22,
      borderWidth: 1,
      gap: 16,
      padding: 20,
      width: 300,
    },
    title: { color: colors.ink, fontFamily: fontFamilies.galmuri11Bold, fontSize: 24, lineHeight: 28 },
    dateFields: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
    yearField: { ...box, width: 96 },
    dateField: { ...box, width: 60 },
    separator: { ...word, color: colors.textSecondary, marginHorizontal: 5 },
    actions: { flexDirection: 'row', justifyContent: 'flex-end' },
    action: { justifyContent: 'center', minHeight: 40, paddingHorizontal: 12 },
    cancel: { ...word, color: colors.textSecondary },
    confirm: { ...word, color: colors.ink },
    disabled: { color: colors.textDisabled },
  } as const;
}
