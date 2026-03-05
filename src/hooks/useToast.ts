'use client';

import { useState, useEffect } from 'react';

export type ToastType = 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

type Listener = (toasts: Toast[]) => void;

let toastList: Toast[] = [];
const listeners = new Set<Listener>();

function notify() {
  const snapshot = [...toastList];
  listeners.forEach((l) => l(snapshot));
}

export function addToast(type: ToastType, message: string) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  toastList = [...toastList, { id, type, message }];
  notify();
  setTimeout(() => removeToast(id), 5000);
}

export function removeToast(id: string) {
  toastList = toastList.filter((t) => t.id !== id);
  notify();
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    listeners.add(setToasts);
    setToasts([...toastList]);
    return () => {
      listeners.delete(setToasts);
    };
  }, []);

  return { toasts, addToast, removeToast };
}
