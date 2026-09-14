import { Outlet, Link, useLocation } from 'react-router-dom';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import ErrorBoundary from './ErrorBoundary';
import { retryOperation, discardOperation } from '../offline/outbox';
import {
  ShoppingCart,
  Settings,
  ChefHat,
  WifiOff,
  CloudUpload,
  AlertTriangle,
  RotateCw,
  X,
  Library,
  CalendarDays,
} from 'lucide-react';

export default function Layout() {
  const { online, operations, queueCount, failedCount } = useOnlineStatus();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-navy-950">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-navy-900/80 backdrop-blur-lg border-b border-gray-200 dark:border-navy-800">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2.5 text-primary-600 dark:text-primary-400"
          >
            <ChefHat className="h-7 w-7" />
            <span className="font-bold text-lg ">Kitchen Cupboard</span>
          </Link>

          <Link
            to="/settings"
            aria-label="Settings"
            className={`btn-ghost ${location.pathname === '/settings' ? 'text-primary-600' : ''}`}
          >
            <Settings className="h-5 w-5" />
          </Link>
        </div>
        <nav
          aria-label="Main navigation"
          className="max-w-4xl mx-auto px-4 flex gap-2 pb-2"
        >
          {[
            {
              to: '/',
              label: 'Shopping',
              icon: ShoppingCart,
              active:
                location.pathname === '/' ||
                location.pathname.startsWith('/list/'),
            },
            {
              to: '/planner',
              label: 'Planner',
              icon: CalendarDays,
              active: location.pathname === '/planner',
            },
            {
              to: '/library',
              label: 'Library',
              icon: Library,
              active:
                location.pathname.startsWith('/library') ||
                location.pathname.startsWith('/recipes'),
            },
          ].map(({ to, label, icon: Icon, active }) => (
            <Link
              key={to}
              to={to}
              aria-current={active ? 'page' : undefined}
              className={`flex-1 sm:flex-none justify-center btn-ghost px-2 sm:px-3 flex items-center gap-1 sm:gap-2 text-sm ${active ? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-950/40' : ''}`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
      </header>

      {/* Offline banner */}
      {!online && (
        <div className="bg-amber-500 text-white text-sm font-medium">
          <div className="max-w-4xl mx-auto px-4 py-2 flex items-center gap-2">
            <WifiOff className="h-4 w-4 flex-shrink-0" />
            <span>
              Offline: shopping edits will sync when you reconnect. Recipes and
              plans are available to view.
            </span>
            {queueCount > 0 && (
              <span className="ml-auto flex items-center gap-1.5 bg-amber-600 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                <CloudUpload className="h-3 w-3" />
                {queueCount} pending
              </span>
            )}
          </div>
        </div>
      )}

      {/* Syncing banner — online but still have queued items */}
      {online && queueCount > 0 && failedCount === 0 && (
        <div
          className="bg-blue-500 text-white text-sm font-medium"
          role="status"
        >
          <div className="max-w-4xl mx-auto px-4 py-2 flex items-center gap-2">
            <CloudUpload className="h-4 w-4 flex-shrink-0 animate-pulse" />
            <span>
              Syncing {queueCount} pending change{queueCount !== 1 ? 's' : ''}
              ...
            </span>
          </div>
        </div>
      )}

      {queueCount > 0 && (
        <div
          className={`${failedCount ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900' : 'bg-white dark:bg-navy-900 border-gray-200 dark:border-navy-800'} border-b`}
          role={failedCount ? 'alert' : 'status'}
        >
          <div className="max-w-4xl mx-auto px-4 py-3">
            <div
              className={`flex items-center gap-2 text-sm font-semibold mb-2 ${failedCount ? 'text-red-700 dark:text-red-300' : 'text-gray-700 dark:text-gray-300'}`}
            >
              {failedCount ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <CloudUpload className="h-4 w-4" />
              )}
              {failedCount
                ? `${failedCount} change${failedCount === 1 ? '' : 's'} need attention`
                : `${queueCount} pending change${queueCount === 1 ? '' : 's'}`}
            </div>
            <div className="space-y-2">
              {operations.map((op) => (
                <div key={op.key} className="flex items-center gap-2 text-sm">
                  <span
                    className="flex-1 min-w-0 truncate"
                    title={op.error || op.summary}
                  >
                    {op.summary}
                    {op.error ? `: ${op.error}` : ''}
                  </span>
                  <button
                    className="btn-ghost p-1.5"
                    onClick={() => retryOperation(op.key)}
                    title="Retry"
                  >
                    <RotateCw className="h-4 w-4" />
                  </button>
                  <button
                    className="btn-ghost p-1.5 text-red-600"
                    onClick={() => discardOperation(op.key)}
                    title="Discard and refresh"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
