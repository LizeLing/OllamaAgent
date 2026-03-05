export interface ConversationMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  folderId?: string;
  tags?: string[];
  pinned?: boolean;
  branchedFrom?: { conversationId: string; messageIndex: number };
}

export interface Conversation extends ConversationMeta {
  messages: import('./message').Message[];
}
