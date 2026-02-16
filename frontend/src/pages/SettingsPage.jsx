import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import api from '../api/client';
import Modal from '../components/Modal';
import {
  User, Key, Shield, Tag, Plus, Trash2, Copy, Check, Users,
} from 'lucide-react';

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
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

function ProfileTab() {
  const { user, refreshUser } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saved, setSaved] = useState(false);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      await api.updateMe({ display_name: displayName, email });
      await refreshUser();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      alert(e.message);
    }
  };

  const handleChangePw = async (e) => {
    e.preventDefault();
    try {
      await api.changePassword(currentPw, newPw);
      setPwMsg('Password changed successfully');
      setCurrentPw('');
      setNewPw('');
    } catch (e) {
      setPwMsg(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSave} className="card p-5 space-y-4">
        <h2 className="font-semibold text-lg">Profile</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Username</label>
          <input type="text" value={user?.username || ''} className="input bg-gray-50 dark:bg-navy-800" disabled />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="input"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />
        </div>
        <button type="submit" className="btn-primary">
          {saved ? 'Saved!' : 'Save changes'}
        </button>
      </form>

      <form onSubmit={handleChangePw} className="card p-5 space-y-4">
        <h2 className="font-semibold text-lg">Change Password</h2>
        {pwMsg && (
          <div className={`text-sm px-4 py-3 rounded-xl ${
            pwMsg.includes('success') ? 'bg-green-50 dark:bg-green-950/50 text-green-600' : 'bg-red-50 dark:bg-red-950/50 text-red-600'
          }`}>
            {pwMsg}
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Current Password</label>
          <input
            type="password"
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            className="input"
            required
            autoComplete="current-password"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">New Password</label>
          <input
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            className="input"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        <button type="submit" className="btn-primary">Change Password</button>
      </form>
    </div>
  );
}

function ApiKeysTab() {
  const [keys, setKeys] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState(null);
  const [copied, setCopied] = useState(false);

  const fetchKeys = async () => {
    const data = await api.getApiKeys();
    setKeys(data);
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const key = await api.createApiKey(newKeyName, 'read,write');
      setCreatedKey(key);
      setNewKeyName('');
      setShowCreate(false);
      fetchKeys();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this API key? Any integrations using it will stop working.')) return;
    await api.deleteApiKey(id);
    fetchKeys();
  };

  const copyKey = () => {
    navigator.clipboard.writeText(createdKey.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">API Keys</h2>
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="h-4 w-4" />
            New Key
          </button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          API keys allow external tools and AI agents to access your lists. Use the key as a Bearer token.
        </p>

        {keys.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">No API keys yet</p>
        ) : (
          <div className="space-y-2">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-navy-800 rounded-xl">
                <div>
                  <span className="font-medium">{k.name}</span>
                  <span className="text-sm text-gray-400 ml-2">{k.key_prefix}...</span>
                </div>
                <button onClick={() => handleDelete(k.id)} className="text-red-400 hover:text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create API Key">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Key Name</label>
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="input"
              required
              placeholder="e.g. Home Assistant, ChatGPT"
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-primary flex-1">Create</button>
          </div>
        </form>
      </Modal>

      {/* Created Key Display */}
      <Modal open={!!createdKey} onClose={() => setCreatedKey(null)} title="API Key Created">
        <div className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 text-sm px-4 py-3 rounded-xl">
            Copy this key now. It won't be shown again.
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-gray-100 dark:bg-navy-800 px-4 py-3 rounded-xl text-sm font-mono break-all">
              {createdKey?.key}
            </code>
            <button onClick={copyKey} className="btn-secondary p-2.5 flex-shrink-0">
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <button onClick={() => setCreatedKey(null)} className="btn-primary w-full">Done</button>
        </div>
      </Modal>
    </div>
  );
}

function CategoriesTab() {
  const [categories, setCategories] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newCat, setNewCat] = useState({ name: '', color: '#6b7280' });

  const fetchCategories = async () => {
    const data = await api.getCategories();
    setCategories(data);
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.createCategory(newCat);
      setNewCat({ name: '', color: '#6b7280' });
      setShowCreate(false);
      fetchCategories();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this category?')) return;
    try {
      await api.deleteCategory(id);
      fetchCategories();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-lg">Categories</h2>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="h-4 w-4" />
          New Category
        </button>
      </div>

      <div className="space-y-2">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-navy-800 rounded-xl">
            <div className="flex items-center gap-3">
              <span className="w-4 h-4 rounded-full" style={{ backgroundColor: c.color }} />
              <span className="font-medium">{c.name}</span>
              {c.is_default && <span className="text-xs text-gray-400">Default</span>}
            </div>
            {!c.is_default && (
              <button onClick={() => handleDelete(c.id)} className="text-red-400 hover:text-red-500">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Category">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Name</label>
            <input
              type="text"
              value={newCat.name}
              onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
              className="input"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Color</label>
            <input
              type="color"
              value={newCat.color}
              onChange={(e) => setNewCat({ ...newCat, color: e.target.value })}
              className="w-12 h-10 rounded-lg border border-gray-200 dark:border-navy-700 cursor-pointer"
            />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-primary flex-1">Create</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function AdminTab() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [inviteCodes, setInviteCodes] = useState([]);
  const [copied, setCopied] = useState('');

  const fetchData = async () => {
    const [usersData, codesData] = await Promise.all([
      api.getUsers(),
      api.getInviteCodes(),
    ]);
    setUsers(usersData);
    setInviteCodes(codesData);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateInvite = async () => {
    await api.createInviteCode();
    fetchData();
  };

  const handleToggleActive = async (userId) => {
    await api.toggleUserActive(userId);
    fetchData();
  };

  const handleDeleteUser = async (userId, username) => {
    if (!confirm(`Permanently delete user "${username}"? This will delete all their lists, items, and API keys. This cannot be undone.`)) return;
    try {
      await api.deleteUser(userId);
      fetchData();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleDeleteInvite = async (codeId) => {
    if (!confirm('Revoke this invite code?')) return;
    try {
      await api.deleteInviteCode(codeId);
      fetchData();
    } catch (e) {
      alert(e.message);
    }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">Users</h2>
        </div>
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-navy-800 rounded-xl">
              <div>
                <span className="font-medium">{u.display_name || u.username}</span>
                <span className="text-sm text-gray-400 ml-2">@{u.username}</span>
                {u.is_admin && <span className="text-xs text-primary-500 ml-2">Admin</span>}
              </div>
              {u.id !== currentUser?.id && !u.is_admin && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleActive(u.id)}
                    className={`text-xs font-medium px-3 py-1 rounded-lg ${
                      u.is_active
                        ? 'bg-green-100 dark:bg-green-950 text-green-600'
                        : 'bg-red-100 dark:bg-red-950 text-red-600'
                    }`}
                  >
                    {u.is_active ? 'Active' : 'Disabled'}
                  </button>
                  <button
                    onClick={() => handleDeleteUser(u.id, u.display_name || u.username)}
                    className="text-red-400 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">Invite Codes</h2>
          <button onClick={handleCreateInvite} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="h-4 w-4" />
            Generate
          </button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Share invite codes with people you want to give access. Each code can be used once and expires after 7 days.
        </p>
        <div className="space-y-2">
          {inviteCodes.map((c) => (
            <div key={c.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-navy-800 rounded-xl">
              <div className="flex items-center gap-2">
                <code className="font-mono text-sm">{c.code}</code>
                {c.is_used && <span className="text-xs text-gray-400">Used</span>}
              </div>
              {!c.is_used && (
                <div className="flex items-center gap-1">
                  <button onClick={() => copyCode(c.code)} className="btn-ghost p-1.5">
                    {copied === c.code ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                  <button onClick={() => handleDeleteInvite(c.id)} className="text-red-400 hover:text-red-500 p-1.5">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
          {inviteCodes.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">No invite codes yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
