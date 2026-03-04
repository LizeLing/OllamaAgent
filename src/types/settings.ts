export interface Settings {
  systemPrompt: string;
  maxIterations: number;
  allowedPaths: string[];
  deniedPaths: string[];
  responseLanguage: string;
  ollamaUrl: string;
  ollamaModel: string;
  embeddingModel: string;
  imageModel: string;
  searxngUrl: string;
  autoReadResponses: boolean;
  ttsVoice: string;
}
