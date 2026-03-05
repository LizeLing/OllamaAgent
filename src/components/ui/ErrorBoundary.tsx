'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen bg-background">
          <div className="text-center max-w-md px-6">
            <div className="text-4xl mb-4">&#x26A0;&#xFE0F;</div>
            <h2 className="text-lg font-semibold text-foreground mb-2">오류가 발생했습니다</h2>
            <p className="text-sm text-muted mb-4">
              {this.state.error?.message || '알 수 없는 오류'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors text-sm"
            >
              새로고침
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
