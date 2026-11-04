import { useEffect } from 'react';
import { Tabs, usePathname } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { BottomNavigation } from '@/src/components/navigation';
import { prefetchActiveChat } from '@/src/features/chat/chatSessionCache';

export default function TabLayout() {
  const pathname = usePathname();
  const isHome = pathname.endsWith('/home');

  useEffect(() => {
    if (isHome) void prefetchActiveChat();
  }, [isHome]);

  return (
    <View style={styles.root}>
      <Tabs
        tabBar={(props) => <BottomNavigation {...props} />}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tabs.Screen name="home" options={{ title: '홈' }} />
        <Tabs.Screen name="diet" options={{ title: '식단' }} />
        <Tabs.Screen name="exercise" options={{ title: '운동' }} />
        <Tabs.Screen name="community" options={{ title: '커뮤니티' }} />
        <Tabs.Screen name="my" options={{ title: '마이' }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
