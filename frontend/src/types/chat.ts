export type ChatStatus = 'active' | 'archived';
export type ChatSenderType = 'assistant' | 'user';

export interface Chat {
  chat_id: string;
  created_at?: string;
  status?: ChatStatus;
  title?: string | null;
  updated_at?: string;
}

export interface ChatMessage {
  client_message_id?: string | null;
  content: string;
  created_at: string;
  evidence?: unknown[];
  intent?: string | null;
  message_id: string;
  needs_more_data?: boolean;
  required_data?: unknown[];
  response_source?: string | null;
  sender_type: ChatSenderType;
  // Exercise chat actions; the card is shown only from these, never from the text.
  action?: string | null;
  action_status?: string | null;
  action_data?: unknown;
  pending_action_id?: string | null;
}

export interface ChatListResponse {
  chats: Chat[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface CreateChatResponse {
  chat: Chat;
}

export interface ChatMessagesResponse {
  chat_id: string;
  has_more: boolean;
  messages: ChatMessage[];
  next_cursor: string | null;
}

export interface SendChatMessageResponse {
  assistant_message: ChatMessage;
  chat: Chat;
  is_replay: boolean;
  user_message: ChatMessage;
}

export interface ExerciseDecisionResponse extends SendChatMessageResponse {
  adjusted_items: unknown[];
  exercise_session: { session: unknown; items: unknown[] };
}

export interface UpdateChatResponse {
  chat: Chat;
}
