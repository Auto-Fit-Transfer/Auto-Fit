import { useState } from 'react';
import { Modal, Pressable, TextInput, View } from 'react-native';

import { Text } from '@/src/components/common';
import { radius, spacing, typography, useThemedStyles, type AppTheme } from '@/src/theme';

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
  return {
    overlay: {
      alignItems: 'center',
      backgroundColor: colors.overlay,
      flex: 1,
      justifyContent: 'center',
      padding: spacing.xl,
    },
    dialog: {
      backgroundColor: colors.elevated,
      borderRadius: radius.lg,
      gap: spacing.lg,
      padding: spacing.lg,
      width: 300,
    },
    title: { color: colors.textBody, fontFamily: typography.sectionTitle.fontFamily, fontSize: 16 },
    dateFields: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
    yearField: {
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
      color: colors.textBody,
      fontFamily: typography.body.fontFamily,
      fontSize: 18,
      padding: spacing.xs,
      textAlign: 'center',
      width: 78,
    },
    dateField: {
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
      color: colors.textBody,
      fontFamily: typography.body.fontFamily,
      fontSize: 18,
      padding: spacing.xs,
      textAlign: 'center',
      width: 48,
    },
    separator: { color: colors.textSecondary, fontSize: 18, marginHorizontal: 3 },
    actions: { flexDirection: 'row', justifyContent: 'flex-end' },
    action: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.md },
    cancel: { color: colors.textSecondary, fontFamily: typography.label.fontFamily },
    confirm: { color: colors.primaryPressed, fontFamily: typography.label.fontFamily },
    disabled: { color: colors.textDisabled },
  } as const;
}
