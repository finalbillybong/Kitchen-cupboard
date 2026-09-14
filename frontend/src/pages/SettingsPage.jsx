import { useSearchParams } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import PlannerSettingsTab from './settings/PlannerSettingsTab';
import { useAuth } from '../hooks/useAuth';
import { User, Key, Shield, Tag, SlidersHorizontal } from 'lucide-react';
import ProfileTab from './settings/ProfileTab';
import PreferencesTab from './settings/PreferencesTab';
import ApiKeysTab from './settings/ApiKeysTab';
import CategoriesTab from './settings/CategoriesTab';
import AdminTab from './settings/AdminTab';
import IntegrationsTab from './settings/IntegrationsTab';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get('tab') || 'profile';
  const setTab = (tab) => setParams({ tab });

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'preferences', label: 'Preferences', icon: SlidersHorizontal },
    { id: 'categories', label: 'Shopping aisles', icon: Tag },
    { id: 'apikeys', label: 'API Keys', icon: Key },
  ];

  if (user?.is_admin) {
    tabs.push({ id: 'planner', label: 'Planner', icon: SlidersHorizontal });
    tabs.push({
      id: 'integrations',
      label: 'Integrations',
      icon: SlidersHorizontal,
    });
    tabs.push({ id: 'admin', label: 'Admin', icon: Shield });
  }

  const tab = tabs.some(item => item.id === requestedTab) ? requestedTab : 'profile';

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.id
                ? 'bg-primary-100 dark:bg-primary-950 text-primary-700 dark:text-primary-300'
                : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-navy-800'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <>
          <ProfileTab />
          <div className="flex flex-wrap gap-3 mt-6">
            <button className="btn-secondary" onClick={toggle}>
              {dark ? 'Use light theme' : 'Use dark theme'}
            </button>
            <button className="btn-ghost text-red-600" onClick={logout}>
              Sign out
            </button>
          </div>
        </>
      )}
      {tab === 'preferences' && <PreferencesTab />}
      {tab === 'apikeys' && <ApiKeysTab />}
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'admin' && user?.is_admin && <AdminTab />}
      {tab === 'planner' && user?.is_admin && <PlannerSettingsTab />}
      {tab === 'integrations' && user?.is_admin && <IntegrationsTab />}
    </div>
  );
}
