export interface Collection {
  id: string;
  name: string;
  createdAt: number;
}

export interface KnowledgeDocument {
  id: string;
  collectionId: string;
  filename: string;
  format: string;
  fileSize: number;
  chunkCount: number;
  chunkIds: string[];
  createdAt: number;
}

export interface ChunkMetadata {
  documentId: string;
  collectionId: string;
  chunkIndex: number;
  source: string;
  filename: string;
}

export interface SearchResultWithSource {
  text: string;
  similarity: number;
  source: string;
  filename: string;
  documentId: string;
  collectionId: string;
}

export interface KnowledgeSearchEvent {
  sources: SearchResultWithSource[];
}
