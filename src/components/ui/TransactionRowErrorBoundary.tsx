import React, { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class TransactionRowErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[TransactionRowErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Fallback: legacy row or provided fallback
      if (this.props.fallback) {
        return this.props.fallback;
      }
      // Minimal safe fallback - empty row placeholder
      return null;
    }

    return this.props.children;
  }
}
