import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import api from '../../api/client';
import { Plus, Trash2, Copy, Check } from 'lucide-react';

export default function AdminTab() {
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
