import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import ErrorBoundary from './ErrorBoundary';
import { ShoppingCart, Settings, LogOut, Sun, Moon, ChefHat, WifiOff, CloudUpload } from 'lucide-react';

export default function Layout() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const { online, queueCount } = useOnlineStatus();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-navy-950">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-navy-900/80 backdrop-blur-lg border-b border-gray-200 dark:border-navy-800">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 text-primary-600 dark:text-primary-400">
            <ChefHat className="h-7 w-7" />
            <span className="font-bold text-lg hidden sm:inline">Kitchen Cupboard</span>
          </Link>

          <div className="flex items-center gap-1">
            <Link
              to="/?stay"
              className={`btn-ghost flex items-center gap-2 text-sm ${
                location.pathname === '/' ? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-950/40' : ''
              }`}
            >
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">Lists</span>
            </Link>
            <Link
              to="/settings"
              className={`btn-ghost flex items-center gap-2 text-sm ${
                location.pathname === '/settings' ? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-950/40' : ''
              }`}
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Settings</span>
            </Link>
            <button onClick={toggle} className="btn-ghost" title={dark ? 'Light mode' : 'Dark mode'}>
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button onClick={logout} className="btn-ghost text-red-500 hover:text-red-600" title="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Offline banner */}
      {!online && (
        <div className="bg-amber-500 text-white text-sm font-medium">
          <div className="max-w-4xl mx-auto px-4 py-2 flex items-center gap-2">
            <WifiOff className="h-4 w-4 flex-shrink-0" />
            <span>You're offline — changes will sync when you reconnect</span>
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
      {online && queueCount > 0 && (
        <div className="bg-blue-500 text-white text-sm font-medium">
          <div className="max-w-4xl mx-auto px-4 py-2 flex items-center gap-2">
            <CloudUpload className="h-4 w-4 flex-shrink-0 animate-pulse" />
            <span>Syncing {queueCount} pending change{queueCount !== 1 ? 's' : ''}...</span>
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
