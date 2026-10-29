import { useCallback, useEffect, useState } from 'react';
import { Tabs, usePathname } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ChatLauncherProvider, ChatPopup, type AIChatButtonAnchor } from '@/src/components/home';
import { BottomNavigation, type BottomNavigationLayout } from '@/src/components/navigation';
import { prefetchActiveChat } from '@/src/features/chat/chatSessionCache';

export default function TabLayout() {
  const pathname = usePathname();
  const [navigationLayout, setNavigationLayout] = useState<BottomNavigationLayout>();
  const [chatAnchor, setChatAnchor] = useState<AIChatButtonAnchor>();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const handleNavigationLayout = useCallback((layout: BottomNavigationLayout) => {
    setNavigationLayout((current) =>
      current &&
      current.height === layout.height &&
      current.width === layout.width &&
      current.x === layout.x &&
      current.y === layout.y
        ? current
        : layout,
    );
  }, []);
  const handleOpenChat = useCallback((anchor: AIChatButtonAnchor) => {
    setChatAnchor(anchor);
    setIsChatOpen(true);
  }, []);
  const handleRequestCloseChat = useCallback(() => setIsChatOpen(false), []);
  const handleChatCloseComplete = useCallback(() => {}, []);
  const isHome = pathname.endsWith('/home');

  useEffect(() => {
    if (isHome) void prefetchActiveChat();
  }, [isHome]);

  return (
    <ChatLauncherProvider value={handleOpenChat}>
      <View style={styles.root}>
        <Tabs
          tabBar={(props) => (
            <BottomNavigation {...props} onNavigationLayout={handleNavigationLayout} />
          )}
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
        {chatAnchor ? (
          <ChatPopup
            anchor={chatAnchor}
            navigationLayout={navigationLayout}
            onCloseComplete={handleChatCloseComplete}
            onRequestClose={handleRequestCloseChat}
            visible={isChatOpen}
          />
        ) : null}
      </View>
    </ChatLauncherProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
