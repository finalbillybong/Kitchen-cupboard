import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { ShoppingCart, Settings, LogOut, Sun, Moon, ChefHat } from 'lucide-react';

export default function Layout() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 text-primary-600 dark:text-primary-400">
            <ChefHat className="h-7 w-7" />
            <span className="font-bold text-lg hidden sm:inline">Kitchen Cupboard</span>
          </Link>

          <div className="flex items-center gap-1">
            <Link
              to="/"
              className={`btn-ghost flex items-center gap-2 text-sm ${
                location.pathname === '/' ? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-950' : ''
              }`}
            >
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">Lists</span>
            </Link>
            <Link
              to="/settings"
              className={`btn-ghost flex items-center gap-2 text-sm ${
                location.pathname === '/settings' ? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-950' : ''
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

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
