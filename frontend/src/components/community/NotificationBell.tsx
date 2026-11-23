import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { View } from 'react-native';

import BellIcon from '@/assets/icons/ui/bell.svg';
import { getCommunityUnreadCount } from '@/src/api/community';
import { IconButton } from '@/src/components/common';
import { useAppTheme, useThemedStyles, type AppTheme } from '@/src/theme';

export function NotificationBell() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  // shortcut: the dot refreshes when the screen comes back into view, not while it stays open; use push events if it must update live.
  useFocusEffect(useCallback(() => {
    let active = true;
    getCommunityUnreadCount().then(
      (result) => { if (active) setUnread(result.unread_count); },
      () => undefined,
    );
    return () => { active = false; };
  }, []));

  return (
    <View>
      <IconButton
        accessibilityLabel={unread > 0 ? `알림, 읽지 않은 알림 ${unread}개` : '알림'}
        icon={<BellIcon color={colors.ink} height={22} width={22} />}
        onPress={() => router.push('/community/notifications')}
        size={44}
        style={styles.card}
      />
      {unread > 0 ? <View pointerEvents="none" style={styles.dot} /> : null}
    </View>
  );
}

// Renewal A: an outlined card on a ledge; what is unread is a violet square on its corner.
function createStyles({ colors }: AppTheme) {
  return {
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 14,
      borderWidth: 1,
    },
    dot: {
      backgroundColor: colors.primary,
      borderColor: colors.border,
      borderWidth: 1,
      height: 12,
      position: 'absolute',
      right: 6,
      top: 6,
      width: 12,
    },
  } as const;
}
