export interface McpToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

export interface McpCallResult {
  content: { type: string; text?: string }[];
  isError?: boolean;
}
