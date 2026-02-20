import { useState } from 'react';
import Modal from './Modal';
import { X } from 'lucide-react';
import api from '../api/client';

export default function ShareModal({ open, onClose, list, listId, isOwner, onDataChange }) {
  const [shareUsername, setShareUsername] = useState('');
  const [shareRole, setShareRole] = useState('editor');

  const handleShare = async (e) => {
    e.preventDefault();
    try {
      await api.shareList(listId, shareUsername, shareRole);
      setShareUsername('');
      onClose();
      onDataChange();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleRemoveMember = async (userId) => {
    try {
      await api.unshareList(listId, userId);
      onDataChange();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Share List">
      <div className="space-y-4">
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Members</h3>
          {list.members.map((m) => (
            <div key={m.id} className="flex items-center justify-between py-2">
              <div>
                <span className="font-medium">{m.display_name || m.username}</span>
                <span className="text-sm text-gray-400 ml-2">@{m.username}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-gray-100 dark:bg-navy-800 text-gray-500 px-2 py-1 rounded-lg">
                  {m.role}
                </span>
                {isOwner && m.role !== 'owner' && (
                  <button
                    onClick={() => handleRemoveMember(m.user_id)}
                    className="text-red-400 hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {isOwner && (
          <form onSubmit={handleShare} className="border-t border-gray-100 dark:border-navy-800 pt-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Add member</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={shareUsername}
                onChange={(e) => setShareUsername(e.target.value)}
                className="input flex-1"
                placeholder="Username"
                required
              />
              <select
                value={shareRole}
                onChange={(e) => setShareRole(e.target.value)}
                className="input w-28"
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <button type="submit" className="btn-primary">Add</button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
