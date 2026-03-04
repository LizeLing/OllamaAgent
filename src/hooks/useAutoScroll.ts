'use client';

import { useEffect, useRef, useCallback } from 'react';

export function useAutoScroll<T extends HTMLElement>(dependency: unknown) {
  const ref = useRef<T>(null);
  const userScrolledUp = useRef(false);

  const scrollToBottom = useCallback(() => {
    if (ref.current && !userScrolledUp.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [dependency, scrollToBottom]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      userScrolledUp.current = scrollHeight - scrollTop - clientHeight > 100;
    };

    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  return { ref, scrollToBottom };
}
