import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import api from '../../api/client';

export default function ProfileTab() {
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
