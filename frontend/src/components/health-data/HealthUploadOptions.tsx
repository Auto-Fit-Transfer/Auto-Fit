import { useState, type ComponentType } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import type { SvgProps } from 'react-native-svg';

import CameraIcon from '@/assets/icons/ui/camera.svg';
import CaretRightIcon from '@/assets/icons/ui/caret-right.svg';
import FileTextIcon from '@/assets/icons/ui/file-text.svg';
import { Text } from '@/src/components/common';
import { getHealthFileProblem } from '@/src/features/health-data/healthUpload';
import {
  type SelectedHealthFile,
  useHealthFilePicker,
} from '@/src/features/health-data/useHealthFilePicker';
import { radius, useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

type Source = SelectedHealthFile['source'];

export interface HealthUploadOptionsProps {
  // True while the chosen file is being sent; the card that started it shows a spinner.
  busy?: boolean;
  onSelectFile: (file: SelectedHealthFile) => Promise<void> | void;
}

// The two big ways to add a result sheet (Figma B1 · B4): take a photo or choose a file.
export function HealthUploadOptions({ busy = false, onSelectFile }: HealthUploadOptionsProps) {
  const { isSelecting, pickDocument, takePhoto } = useHealthFilePicker();
  const [activeSource, setActiveSource] = useState<Source | null>(null);
  const disabled = busy || isSelecting || activeSource !== null;

  const select = async (source: Source) => {
    if (disabled) return;
    setActiveSource(source);
    try {
      const file = await (source === 'camera' ? takePhoto() : pickDocument());
      if (!file) return;
      const problem = getHealthFileProblem(file);
      if (problem) {
        Alert.alert('올릴 수 없는 파일이에요', problem);
        return;
      }
      await onSelectFile(file);
    } finally {
      setActiveSource(null);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <UploadOption
        busy={activeSource === 'camera'}
        caption="종이 결과지를 바로 찍어요"
        disabled={disabled}
        Icon={CameraIcon}
        onPress={() => void select('camera')}
        title="사진 찍기"
      />
      <UploadOption
        busy={activeSource === 'document'}
        caption="PDF · JPG · PNG · HEIC, 10MB까지"
        disabled={disabled}
        Icon={FileTextIcon}
        onPress={() => void select('document')}
        title="파일에서 고르기"
      />
    </View>
  );
}

function UploadOption({
  busy,
  caption,
  disabled,
  Icon,
  onPress,
  title,
}: {
  busy: boolean;
  caption: string;
  disabled: boolean;
  Icon: ComponentType<SvgProps>;
  onPress: () => void;
  title: string;
}) {
  const { colors, easyMode } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const iconSize = easyMode ? 28 : 24;
  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.option, pressed && styles.pressed]}
    >
      <View style={styles.iconBox}>
        <Icon color={colors.textPrimary} height={iconSize} width={iconSize} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.caption}>{caption}</Text>
      </View>
      {busy ? (
        <ActivityIndicator color={colors.textSecondary} />
      ) : (
        <CaretRightIcon color={colors.textSecondary} height={20} width={20} />
      )}
    </Pressable>
  );
}

function createStyles({ colors, text, easyMode }: AppTheme) {
  return {
    option: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.card,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 16,
      minHeight: easyMode ? 96 : 84,
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    iconBox: {
      alignItems: 'center',
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 22,
      borderWidth: 1,
      height: easyMode ? 52 : 44,
      justifyContent: 'center',
      width: easyMode ? 52 : 44,
    },
    copy: { flex: 1, gap: 2 },
    title: { ...text.body1Strong, color: colors.textPrimary },
    caption: { ...text.body2, color: colors.textSecondary },
    pressed: { opacity: 0.75 },
  } as const;
}
