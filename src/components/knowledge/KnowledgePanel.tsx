'use client';

import { useState, useEffect, useCallback } from 'react';
import CollectionList from './CollectionList';
import DocumentList from './DocumentList';
import type { Collection } from '@/types/knowledge';
import type { KnowledgeDocument } from '@/types/knowledge';

export default function KnowledgePanel({ onClose }: { onClose: () => void }) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCollections = useCallback(async () => {
    try {
      const res = await fetch('/api/knowledge/collections');
      const data = await res.json();
      setCollections(Array.isArray(data) ? data : []);
    } catch {
      setCollections([]);
    }
  }, []);

  const fetchDocuments = useCallback(async (collectionId: string) => {
    try {
      const res = await fetch(`/api/knowledge/documents?collectionId=${collectionId}`);
      const data = await res.json();
      setDocuments(Array.isArray(data) ? data : []);
    } catch {
      setDocuments([]);
    }
  }, []);

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  useEffect(() => {
    if (selectedCollectionId) {
      fetchDocuments(selectedCollectionId);
    }
  }, [selectedCollectionId, fetchDocuments]);

  const handleCreateCollection = async (name: string) => {
    await fetch('/api/knowledge/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    fetchCollections();
  };

  const handleDeleteCollection = async (id: string) => {
    await fetch(`/api/knowledge/collections/${id}`, { method: 'DELETE' });
    if (selectedCollectionId === id) {
      setSelectedCollectionId(null);
      setDocuments([]);
    }
    fetchCollections();
  };

  const handleUploadDocument = async (files: FileList) => {
    if (!selectedCollectionId) return;
    setLoading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('collectionId', selectedCollectionId);
        await fetch('/api/knowledge/documents', { method: 'POST', body: formData });
      }
      fetchDocuments(selectedCollectionId);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    await fetch(`/api/knowledge/documents/${id}`, { method: 'DELETE' });
    if (selectedCollectionId) {
      fetchDocuments(selectedCollectionId);
    }
  };

  const selectedCollection = collections.find((c) => c.id === selectedCollectionId);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6 md:py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            {selectedCollectionId && (
              <button
                onClick={() => { setSelectedCollectionId(null); setDocuments([]); }}
                className="text-muted hover:text-foreground mr-1"
                title="뒤로"
              >
                ←
              </button>
            )}
            <h2 className="text-xl font-semibold">
              {selectedCollection ? selectedCollection.name : '지식 베이스'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-muted hover:text-foreground bg-card hover:bg-card-hover rounded-lg transition-colors"
          >
            돌아가기
          </button>
        </div>

        {selectedCollectionId ? (
          <DocumentList
            documents={documents}
            loading={loading}
            onUpload={handleUploadDocument}
            onDelete={handleDeleteDocument}
          />
        ) : (
          <CollectionList
            collections={collections}
            onSelect={setSelectedCollectionId}
            onCreate={handleCreateCollection}
            onDelete={handleDeleteCollection}
          />
        )}
      </div>
    </div>
  );
}
