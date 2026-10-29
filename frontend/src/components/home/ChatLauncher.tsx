import { createContext, useContext } from 'react';

import type { AIChatButtonAnchor } from './DraggableAIChatButton';

// The tab layout owns the Qwony chat popup; screens open it through this.
const ChatLauncherContext = createContext<(anchor: AIChatButtonAnchor) => void>(() => {});

export const ChatLauncherProvider = ChatLauncherContext.Provider;

export function useOpenChat() {
  return useContext(ChatLauncherContext);
}
