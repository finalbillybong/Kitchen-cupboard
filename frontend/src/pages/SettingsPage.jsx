import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { User, Key, Shield, Tag } from 'lucide-react';
import ProfileTab from './settings/ProfileTab';
import ApiKeysTab from './settings/ApiKeysTab';
import CategoriesTab from './settings/CategoriesTab';
import AdminTab from './settings/AdminTab';

export default function SettingsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('profile');

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'categories', label: 'Categories', icon: Tag },
  ];

  if (user?.is_admin) {
    tabs.push({ id: 'apikeys', label: 'API Keys', icon: Key });
    tabs.push({ id: 'admin', label: 'Admin', icon: Shield });
  }

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

      {tab === 'profile' && <ProfileTab />}
      {tab === 'apikeys' && <ApiKeysTab />}
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'admin' && <AdminTab />}
    </div>
  );
}
