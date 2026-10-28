import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[VerifAI ErrorBoundary caught an error]:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-rose-950 space-y-4 shadow-sm my-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-rose-100 text-rose-700 flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1 flex-1">
              <h4 className="text-sm font-bold text-rose-900">
                {this.props.fallbackTitle || 'Unable to display section'}
              </h4>
              <p className="text-xs text-rose-700 leading-relaxed">
                {this.props.fallbackMessage ||
                  'An unexpected rendering issue occurred while preparing this content. Other tabs and features remain fully operational.'}
              </p>
              {this.state.error?.message && (
                <p className="text-[11px] font-mono bg-rose-100/60 p-2 rounded-lg text-rose-800 break-all mt-2">
                  {this.state.error.message}
                </p>
              )}
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end">
            <button
              onClick={this.handleReset}
              className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Section</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
