import { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import api from '../../api/client';
import { Plus, Trash2, Copy, Check } from 'lucide-react';

export default function ApiKeysTab() {
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
