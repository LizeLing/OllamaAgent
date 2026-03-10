export interface Artifact {
  id: string;
  type: 'code' | 'image' | 'file';
  name: string;
  content: string;
  language?: string;
  conversationId: string;
  createdAt: number;
}
