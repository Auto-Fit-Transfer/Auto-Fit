import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  BackHandler,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import CloseIcon from '@/assets/icons/common/X.svg';
import PaperPlaneIcon from '@/assets/icons/feature/PaperPlane_Fill.svg';
import { createChat, getChatMessages, getChats, sendChatMessage } from '@/src/api/chat';
import { getApiErrorMessage } from '@/src/api/client';
import { ChatCharacterAvatar, getChatAvatarVariant } from '@/src/components/chat/ChatCharacterAvatar';
import { CustomScrollIndicator, useCustomScrollIndicator } from '@/src/components/common';
import {
  BOTTOM_NAVIGATION_MIN_BOTTOM_GAP,
  getBottomNavigationVisualHeight,
  type BottomNavigationLayout,
} from '@/src/components/navigation';
import {
  getChatSessionSnapshot,
  mergeChatSessionMessages,
  prefetchActiveChat,
  updateChatSessionSnapshot,
} from '@/src/features/chat/chatSessionCache';
import { chatCharacters, chatWelcomes, displayChatAnswer, loadChatCharacter } from '@/src/features/chat/chatCharacters';
import { colors, fontFamilies, radius } from '@/src/theme';
import type { ChatMessage as ServerChatMessage } from '@/src/types/chat';

import type { AIChatButtonAnchor } from './DraggableAIChatButton';

const referenceScreenWidth = 412;
const referencePopupTop = 232;
const referencePopupWidth = 370;
const referencePopupHeight = 550;
const referencePopupNavigationGap = 48;
const popupDuration = 360;
const keyboardInputGap = 24;
const welcomeMessageText = chatWelcomes.quni;

const webFixedOverlayStyle: ViewStyle | undefined =
  Platform.OS === 'web'
    ? ({
        overscrollBehavior: 'none',
        touchAction: 'none',
        userSelect: 'none',
      } as ViewStyle)
    : undefined;

const webMessageScrollStyle: ViewStyle | undefined =
  Platform.OS === 'web'
    ? ({ overscrollBehavior: 'contain', touchAction: 'pan-y' } as ViewStyle)
    : undefined;

const webOverlayProps =
  Platform.OS === 'web'
    ? {
        draggable: false,
        onDragStart: (event: { preventDefault: () => void }) => event.preventDefault(),
      }
    : {};

interface ChatPopupProps {
  anchor: AIChatButtonAnchor;
  navigationLayout?: BottomNavigationLayout;
  onCloseComplete: () => void;
  onRequestClose: () => void;
  visible: boolean;
}

interface OverlayFrame {
  x: number;
  y: number;
}

type UiChatMessage = {
  clientMessageId?: string;
  createdAt: number;
  id: string;
  needsMoreData?: boolean;
  role: 'assistant' | 'user';
  text: string;
};

type PendingMessage = {
  chatId: string;
  clientMessageId: string;
  content: string;
  optimisticId: string;
};

function createInitialMessages(): UiChatMessage[] {
  return [
    {
      createdAt: Date.now(),
      id: 'welcome',
      role: 'assistant',
      text: welcomeMessageText,
    },
  ];
}

function mapServerMessage(message: ServerChatMessage): UiChatMessage {
  const createdAt = Date.parse(message.created_at);
  return {
    clientMessageId: message.client_message_id ?? undefined,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    id: message.message_id,
    needsMoreData: message.needs_more_data,
    role: message.sender_type === 'user' ? 'user' : 'assistant',
    text: message.content,
  };
}

function dedupeMessages(messages: UiChatMessage[]) {
  const seen = new Set<string>();
  return messages.filter((message) => {
    if (seen.has(message.id)) return false;
    seen.add(message.id);
    return true;
  });
}

function mergeServerMessages(current: UiChatMessage[], serverMessages: UiChatMessage[]) {
  const currentWithoutWelcome =
    serverMessages.length > 0 ? current.filter((message) => message.id !== 'welcome') : current;
  const merged = dedupeMessages([...currentWithoutWelcome, ...serverMessages]);
  const isUnchanged =
    merged.length === current.length &&
    merged.every(
      (message, index) =>
        message.id === current[index]?.id &&
        message.text === current[index]?.text &&
        message.createdAt === current[index]?.createdAt,
    );

  return isUnchanged ? current : merged;
}

function createClientMessageId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
    .slice(6, 8)
    .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

function formatMessageTime(timestamp: number) {
  const date = new Date(timestamp);
  const period = date.getHours() < 12 ? '오전' : '오후';
  const hour = date.getHours() % 12 || 12;
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${period} ${hour}:${minute}`;
}

function SendButtonGradient() {
  return (
    <Svg height={40} style={StyleSheet.absoluteFill} width={40}>
      <Defs>
        <LinearGradient id="sendGradient" x1="0" x2="1" y1="1" y2="0">
          <Stop offset="0" stopColor={colors.primary} />
          <Stop offset="0.5" stopColor="#42C0A6" />
          <Stop offset="1" stopColor={colors.primary} />
        </LinearGradient>
      </Defs>
      <Rect fill="url(#sendGradient)" height={40} rx={20} width={40} />
    </Svg>
  );
}

export function ChatPopup({
  anchor,
  navigationLayout,
  onCloseComplete,
  onRequestClose,
  visible,
}: ChatPopupProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const overlayRef = useRef<View>(null);
  const messageScrollRef = useRef<ScrollView>(null);
  const automaticScrollRef = useRef(false);
  const automaticScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const wasVisibleRef = useRef(false);
  const visibleRef = useRef(visible);
  const chatLoadRequestRef = useRef(0);
  const [initialChatSnapshot] = useState(getChatSessionSnapshot);
  const chatIdRef = useRef<string | null>(initialChatSnapshot.chatId);
  const pendingMessageRef = useRef<PendingMessage | null>(null);
  const messagePaginationRef = useRef<{ hasMore: boolean; nextCursor: string | null }>({
    hasMore: false,
    nextCursor: null,
  });
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const [chatId, setChatId] = useState<string | null>(initialChatSnapshot.chatId);
  const [character, setCharacter] = useState<(typeof chatCharacters)[number]>(chatCharacters[0]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [messages, setMessages] = useState<UiChatMessage[]>(() => {
    const prefetchedMessages = initialChatSnapshot.messages.map(mapServerMessage);
    if (prefetchedMessages.length > 0) return dedupeMessages(prefetchedMessages);
    if (initialChatSnapshot.status === 'ready' && initialChatSnapshot.chatId) {
      return createInitialMessages();
    }
    return [];
  });
  const [overlayFrame, setOverlayFrame] = useState<OverlayFrame>({ x: 0, y: 0 });
  const [popupTopBeforeKeyboard, setPopupTopBeforeKeyboard] = useState<number | null>(null);
  const chatScrollIndicator = useCustomScrollIndicator({ showOnScroll: false });

  const bottomClearance = Math.max(insets.bottom, BOTTOM_NAVIGATION_MIN_BOTTOM_GAP);
  const estimatedNavigationTop =
    windowHeight - bottomClearance - getBottomNavigationVisualHeight(windowHeight);
  const navigationTop = navigationLayout
    ? navigationLayout.y - overlayFrame.y
    : estimatedNavigationTop;
  const availableWidth = Math.max(0, windowWidth - insets.left - insets.right);
  const popupScale = Math.min(1, availableWidth / referenceScreenWidth);
  const popupWidth = referencePopupWidth * popupScale;
  const basePopupHeight = referencePopupHeight * popupScale;
  const popupLeft = insets.left + (availableWidth - popupWidth) / 2;
  const minimumPopupTop = Math.max(8, insets.top - overlayFrame.y + 8);
  const preferredPopupTop = referencePopupTop * popupScale;
  const maximumPopupTop =
    navigationTop - referencePopupNavigationGap * popupScale - basePopupHeight;
  const restingPopupTop = Math.max(minimumPopupTop, Math.min(preferredPopupTop, maximumPopupTop));
  const keyboardSafeBottom =
    keyboardTop === null || keyboardHeight <= 0
      ? null
      : keyboardTop - overlayFrame.y - keyboardInputGap;
  const popupTop =
    keyboardSafeBottom === null ? restingPopupTop : (popupTopBeforeKeyboard ?? restingPopupTop);
  const popupHeight =
    keyboardSafeBottom === null
      ? basePopupHeight
      : Math.max(0, Math.min(basePopupHeight, keyboardSafeBottom - popupTop));
  const popupContentHeight = popupHeight / Math.max(popupScale, 0.01);

  const anchorCenter = useMemo(
    () => ({
      x: anchor.x - overlayFrame.x + anchor.width / 2,
      y: anchor.y - overlayFrame.y + anchor.height / 2,
    }),
    [anchor, overlayFrame],
  );
  const popupCenterX = popupLeft + popupWidth / 2;
  const popupCenterY = popupTop + popupHeight / 2;
  const startTranslateX = anchorCenter.x - popupCenterX;
  const startTranslateY = anchorCenter.y - popupCenterY;
  const startScaleX = anchor.width / popupWidth;
  const startScaleY = anchor.height / Math.max(popupHeight, 1);

  const scrollToLatestMessage = useCallback((animated: boolean) => {
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    if (automaticScrollTimerRef.current) clearTimeout(automaticScrollTimerRef.current);

    automaticScrollRef.current = true;

    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      messageScrollRef.current?.scrollToEnd({ animated });
      automaticScrollTimerRef.current = setTimeout(
        () => {
          automaticScrollRef.current = false;
          automaticScrollTimerRef.current = null;
        },
        animated ? 600 : 100,
      );
    });
  }, []);

  const handleRequestClose = useCallback(() => {
    Keyboard.dismiss();
    onRequestClose();
  }, [onRequestClose]);

  const handleCloseComplete = useCallback(() => {
    onCloseComplete();
  }, [onCloseComplete]);

  const initializeChat = useCallback(async () => {
    const requestId = ++chatLoadRequestRef.current;
    const cachedChatId = chatIdRef.current;
    if (!cachedChatId) setIsInitialLoading(true);
    setErrorMessage(null);

    try {
      let activeChatId = cachedChatId;
      let prefetchedHistory = cachedChatId ? null : await prefetchActiveChat();

      if (requestId !== chatLoadRequestRef.current || !visibleRef.current) return;

      if (!activeChatId && prefetchedHistory?.status === 'ready') {
        activeChatId = prefetchedHistory.chatId;
      }

      if (!activeChatId) {
        if (prefetchedHistory?.status === 'error') {
          const chatList = await getChats({ limit: 20, status: 'active' });
          activeChatId = chatList.chats[0]?.chat_id ?? null;
        }
        activeChatId ??= (await createChat('건강 상담')).chat.chat_id;
      }
      const history =
        !cachedChatId && prefetchedHistory?.chatId === activeChatId
          ? {
              has_more: prefetchedHistory.hasMore,
              messages: prefetchedHistory.messages,
              next_cursor: prefetchedHistory.nextCursor,
            }
          : await getChatMessages(activeChatId);

      if (requestId !== chatLoadRequestRef.current || !visibleRef.current) return;

      const serverMessages = dedupeMessages(history.messages.map(mapServerMessage));
      const pending = pendingMessageRef.current;
      const pendingWasStored = Boolean(
        pending &&
        serverMessages.some((message) => message.clientMessageId === pending.clientMessageId),
      );

      if (pendingWasStored) {
        pendingMessageRef.current = null;
        setInputText('');
      }

      chatIdRef.current = activeChatId;
      setChatId(activeChatId);
      setMessages((current) => {
        const withoutStoredPending = pendingWasStored
          ? current.filter((message) => message.id !== pending?.optimisticId)
          : current;
        const merged = mergeServerMessages(withoutStoredPending, serverMessages);
        const messagesAfterInitialLoad = merged.length === 0 ? createInitialMessages() : merged;
        if (!pending || pendingWasStored || pending.chatId !== activeChatId) {
          return messagesAfterInitialLoad;
        }
        return dedupeMessages([
          ...messagesAfterInitialLoad,
          {
            clientMessageId: pending.clientMessageId,
            createdAt: Date.now(),
            id: pending.optimisticId,
            role: 'user',
            text: pending.content,
          },
        ]);
      });
      messagePaginationRef.current = {
        hasMore: history.has_more,
        nextCursor: history.next_cursor,
      };
      updateChatSessionSnapshot(
        activeChatId,
        history.messages,
        history.next_cursor,
        history.has_more,
      );
    } catch (error) {
      if (requestId !== chatLoadRequestRef.current || !visibleRef.current) return;
      console.error('채팅 초기화 실패:', error);
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      if (!cachedChatId && requestId === chatLoadRequestRef.current) {
        setIsInitialLoading(false);
      }
    }
  }, []);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || text.length > 500 || !chatId || isSending || isInitialLoading) return;

    const existingPending = pendingMessageRef.current;
    const pending =
      existingPending?.chatId === chatId && existingPending.content === text
        ? existingPending
        : {
            chatId,
            clientMessageId: createClientMessageId(),
            content: text,
            optimisticId: `optimistic-${Date.now()}`,
          };

    pendingMessageRef.current = pending;
    setErrorMessage(null);
    setIsSending(true);
    setMessages((current) =>
      dedupeMessages([
        ...current,
        {
          clientMessageId: pending.clientMessageId,
          createdAt: Date.now(),
          id: pending.optimisticId,
          role: 'user',
          text,
        },
      ]),
    );

    try {
      const response = await sendChatMessage(chatId, text, pending.clientMessageId, character.id);
      mergeChatSessionMessages(chatId, [response.user_message, response.assistant_message]);
      setMessages((current) =>
        dedupeMessages([
          ...current.filter((message) => message.id !== pending.optimisticId),
          mapServerMessage(response.user_message),
          mapServerMessage(response.assistant_message),
        ]),
      );
      pendingMessageRef.current = null;
      setInputText((current) => (current.trim() === text ? '' : current));
    } catch (error) {
      console.error('채팅 메시지 전송 실패:', error);
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsSending(false);
    }
  }, [character.id, chatId, inputText, isInitialLoading, isSending]);

  useEffect(() => {
    const duration = reduceMotion ? 1 : popupDuration;

    progress.value = withTiming(
      visible ? 1 : 0,
      {
        duration,
        easing: Easing.bezier(0.22, 0.82, 0.24, 1),
      },
      (finished) => {
        if (finished && !visible) runOnJS(handleCloseComplete)();
      },
    );
  }, [handleCloseComplete, progress, reduceMotion, visible]);

  useEffect(() => {
    visibleRef.current = visible;

    if (visible && !wasVisibleRef.current) {
      void loadChatCharacter().then(setCharacter);
      void initializeChat();
    } else if (!visible) {
      chatLoadRequestRef.current += 1;
    }

    wasVisibleRef.current = visible;
  }, [initializeChat, visible]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardTop(event.endCoordinates.screenY);
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardTop(null);
      setKeyboardHeight(0);
      setPopupTopBeforeKeyboard(null);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (keyboardTop !== null) scrollToLatestMessage(false);
  }, [keyboardTop, scrollToLatestMessage]);

  useEffect(
    () => () => {
      chatLoadRequestRef.current += 1;
      if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
      if (automaticScrollTimerRef.current) clearTimeout(automaticScrollTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!visible) return undefined;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleRequestClose();
      return true;
    });

    return () => subscription.remove();
  }, [handleRequestClose, visible]);

  const dimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 0.45]),
  }));

  const popupAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.12, 1], [0, 0.55, 1]),
    transform: [
      { translateX: interpolate(progress.value, [0, 1], [startTranslateX, 0]) },
      { translateY: interpolate(progress.value, [0, 1], [startTranslateY, 0]) },
      {
        scaleX: interpolate(
          progress.value,
          [0, 0.28, 1],
          [startScaleX, Math.max(startScaleX, 0.22), 1],
        ),
      },
      {
        scaleY: interpolate(
          progress.value,
          [0, 0.28, 1],
          [startScaleY, Math.max(startScaleY, 0.13), 1],
        ),
      },
    ],
  }));

  const handleOverlayLayout = (_event: LayoutChangeEvent) => {
    overlayRef.current?.measureInWindow((x, y) => {
      setOverlayFrame((current) => (current.x === x && current.y === y ? current : { x, y }));
    });
  };

  const isSendDisabled = isInitialLoading || isSending || !chatId || inputText.trim().length === 0;

  return (
    <View
      {...webOverlayProps}
      ref={overlayRef}
      accessibilityViewIsModal
      onLayout={handleOverlayLayout}
      pointerEvents={visible ? 'auto' : 'none'}
      style={[styles.overlay, webFixedOverlayStyle]}
    >
      <Animated.View style={[styles.dim, dimStyle]} />
      <Animated.View
        style={[
          styles.popupShell,
          {
            height: popupHeight,
            left: popupLeft,
            top: popupTop,
            width: popupWidth,
          },
          popupAnimatedStyle,
        ]}
      >
        <View
          style={[
            styles.popupContent,
            {
              height: popupContentHeight,
              transform: [{ scale: popupScale }],
            },
          ]}
        >
          <View style={styles.topSection}>
            <View style={styles.titleRow}>
              <Pressable accessibilityLabel="대화 상대 바꾸기" accessibilityRole="button" onPress={() => { onRequestClose(); router.push('/chat/characters'); }} style={styles.titleLeft}>
                <ChatCharacterAvatar characterId={character.id} size={40} />
                <Text style={styles.title}>{character.name} · 바꾸기</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="AI 채팅 닫기"
                accessibilityRole="button"
                hitSlop={7}
                onPress={handleRequestClose}
                style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              >
                <CloseIcon color={colors.primary} height={17} stroke={colors.primary} width={17} />
              </Pressable>
            </View>
            <View style={styles.divider} />
          </View>

          <View style={styles.dialogsContainer}>
            <ScrollView
              bounces={false}
              contentContainerStyle={styles.dialogsContent}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              onContentSizeChange={(width, height) => {
                chatScrollIndicator.onContentSizeChange(width, height);
                scrollToLatestMessage(true);
              }}
              onLayout={chatScrollIndicator.onLayout}
              onScroll={(event) => {
                chatScrollIndicator.onScroll(event);
                if (!automaticScrollRef.current) chatScrollIndicator.show();
              }}
              onScrollBeginDrag={() => {
                automaticScrollRef.current = false;
                if (automaticScrollTimerRef.current) {
                  clearTimeout(automaticScrollTimerRef.current);
                  automaticScrollTimerRef.current = null;
                }
                chatScrollIndicator.onScrollBeginDrag();
              }}
              onScrollEndDrag={chatScrollIndicator.onScrollEndDrag}
              overScrollMode="never"
              ref={messageScrollRef}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              style={[styles.dialogs, webMessageScrollStyle]}
            >
              <View style={styles.messages}>
                {messages.map((chatMessage) =>
                  chatMessage.role === 'assistant' ? (
                    <View key={chatMessage.id} style={styles.botRow}>
                      <ChatCharacterAvatar characterId={character.id} size={36} variant={getChatAvatarVariant({ isWelcome: chatMessage.id === 'welcome', needsMoreData: chatMessage.needsMoreData })} />
                      <View style={styles.botContents}>
                        <Text style={styles.botName}>{character.name}</Text>
                        <View style={styles.botBubble}>
                          <Text style={styles.messageText}>{chatMessage.id === 'welcome' ? chatWelcomes[character.id] : displayChatAnswer(chatMessage.text, character.id)}</Text>
                        </View>
                        <Text style={styles.time}>{formatMessageTime(chatMessage.createdAt)}</Text>
                      </View>
                    </View>
                  ) : (
                    <View key={chatMessage.id} style={styles.userDialog}>
                      <View style={styles.userBubble}>
                        <Text style={styles.messageText}>{chatMessage.text}</Text>
                      </View>
                      <Text style={[styles.time, styles.userTime]}>
                        {formatMessageTime(chatMessage.createdAt)}
                      </Text>
                    </View>
                  ),
                )}
                {errorMessage ? (
                  <Text accessibilityLiveRegion="polite" style={styles.errorText}>
                    {errorMessage}
                  </Text>
                ) : null}
              </View>
            </ScrollView>
            <CustomScrollIndicator
              {...chatScrollIndicator.indicatorProps}
              color="rgba(120, 120, 120, 0.4)"
              rightInset={4}
            />
          </View>

          <View style={styles.composer}>
            <TextInput
              accessibilityLabel="AI 채팅 메시지"
              editable={!isInitialLoading}
              maxLength={500}
              onChangeText={setInputText}
              onFocus={() => {
                if (keyboardTop === null) setPopupTopBeforeKeyboard(restingPopupTop);
                scrollToLatestMessage(false);
              }}
              onSubmitEditing={handleSend}
              placeholder="메시지를 입력해주세요..."
              placeholderTextColor={colors.textSecondary}
              returnKeyType="send"
              style={styles.input}
              value={inputText}
            />
            <Pressable
              accessibilityLabel="메시지 보내기"
              accessibilityRole="button"
              disabled={isSendDisabled}
              hitSlop={4}
              onPress={handleSend}
              style={({ pressed }) => [
                styles.sendButton,
                isSending && styles.sendButtonDisabled,
                pressed && styles.pressed,
              ]}
            >
              <SendButtonGradient />
              <PaperPlaneIcon
                color={colors.surface}
                fill={colors.surface}
                height={22}
                style={styles.sendIcon}
                width={22}
              />
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
    zIndex: 30,
  },
  dim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
  },
  popupShell: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    elevation: Platform.OS === 'android' ? 7 : 0,
    overflow: 'hidden',
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { height: -4, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  popupContent: {
    backgroundColor: colors.surface,
    height: referencePopupHeight,
    left: 0,
    position: 'absolute',
    top: 0,
    transformOrigin: 'top left',
    width: referencePopupWidth,
  },
  topSection: {
    gap: 15,
    paddingTop: 16,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  titleLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  title: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 18,
    includeFontPadding: false,
    lineHeight: 24,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderRadius: 16,
    borderWidth: 1,
    elevation: Platform.OS === 'android' ? 1 : 0,
    height: 30,
    justifyContent: 'center',
    shadowColor: colors.primaryDark,
    shadowOffset: { height: 2, width: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2.5,
    width: 30,
  },
  divider: {
    backgroundColor: colors.border,
    height: 2,
    width: '100%',
  },
  dialogs: {
    flex: 1,
  },
  dialogsContainer: {
    flex: 1,
    position: 'relative',
  },
  dialogsContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  messages: {
    gap: 15,
  },
  botRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  botContents: {
    flex: 1,
    gap: 4,
  },
  botName: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardSemiBold,
    fontSize: 12,
    includeFontPadding: false,
    lineHeight: 17,
  },
  botBubble: {
    backgroundColor: '#F2F3F5',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    width: '100%',
  },
  messageText: {
    color: colors.textBody,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 13,
    includeFontPadding: false,
    lineHeight: 18,
  },
  time: {
    color: colors.textSecondary,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 10,
    includeFontPadding: false,
    lineHeight: 15,
  },
  userDialog: {
    alignItems: 'flex-end',
    width: '100%',
  },
  userBubble: {
    backgroundColor: colors.primaryLight,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    width: 220,
  },
  userTime: {
    textAlign: 'right',
    width: '100%',
  },
  errorText: {
    color: colors.danger,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 11,
    includeFontPadding: false,
    lineHeight: 15,
    textAlign: 'center',
  },
  composer: {
    alignItems: 'center',
    backgroundColor: '#F2F3F5',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    flexDirection: 'row',
    gap: 10,
    height: 60,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  input: {
    backgroundColor: '#F2F3F5',
    color: colors.textBody,
    flex: 1,
    fontFamily: fontFamilies.pretendardRegular,
    fontSize: 13,
    height: 40,
    includeFontPadding: false,
    lineHeight: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sendButton: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 40,
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
  sendIcon: {
    zIndex: 1,
  },
  pressed: {
    opacity: 0.72,
  },
});
