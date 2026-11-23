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
        icon={<BellIcon color={colors.textPrimary} height={20} width={20} />}
        onPress={() => router.push('/community/notifications')}
        size={40}
        style={styles.card}
      />
      {unread > 0 ? <View pointerEvents="none" style={styles.dot} /> : null}
    </View>
  );
}

// Renewal B: a round white button; what is unread is the violet dot of "new" on its corner.
function createStyles({ colors }: AppTheme) {
  return {
    card: { backgroundColor: colors.surface, borderRadius: 20 },
    dot: {
      backgroundColor: colors.now,
      borderColor: colors.surface,
      borderRadius: 5,
      borderWidth: 2,
      height: 10,
      position: 'absolute',
      right: 8,
      top: 8,
      width: 10,
    },
  } as const;
}
