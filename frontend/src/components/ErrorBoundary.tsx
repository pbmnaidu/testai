import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  onReset?: () => void;
  fallback?: ReactNode;
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
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-8 flex items-center justify-center min-h-[60vh]">
          <div className="max-w-lg w-full bg-white dark:bg-slate-900 rounded-2xl border border-rose-200 dark:border-rose-900/50 p-6 shadow-xl space-y-4 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 mx-auto">
              <AlertTriangle className="w-7 h-7" />
            </div>
            
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Something went wrong rendering this view
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                An unexpected interface error occurred. The application remains running.
              </p>
            </div>

            {this.state.error?.message && (
              <div className="text-left bg-slate-50 dark:bg-slate-800/80 rounded-xl p-3 border border-slate-200 dark:border-slate-700 text-xs font-mono text-rose-700 dark:text-rose-300 break-words">
                {this.state.error.message}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-bold inline-flex items-center gap-2 hover:opacity-90 transition-opacity"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Reload View
              </button>
              {this.props.onReset && (
                <button
                  onClick={() => {
                    this.handleReset();
                  }}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold inline-flex items-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  <Home className="w-3.5 h-3.5" /> Return to Overview
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
