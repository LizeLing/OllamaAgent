'use client';

import { useSyncExternalStore } from 'react';

export type ToastType = 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

type Listener = () => void;

let toastList: Toast[] = [];
let snapshot: Toast[] = [];
const listeners = new Set<Listener>();

function notify() {
  snapshot = [...toastList];
  listeners.forEach((l) => l());
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

function subscribe(callback: Listener) {
  listeners.add(callback);
  return () => { listeners.delete(callback); };
}

function getSnapshot() {
  return snapshot;
}

const SERVER_SNAPSHOT: Toast[] = [];
function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

export function useToast() {
  const toasts = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { toasts, addToast, removeToast };
}
