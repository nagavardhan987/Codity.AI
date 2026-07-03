import React, { useState, useEffect } from 'react';
import DashboardMetrics from './DashboardMetrics';

export default function QueueList({ projectId, onSelectQueue }: { projectId: string, onSelectQueue: (id: string) => void }) {
  const [queues, setQueues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newQueue, setNewQueue] = useState({ 
    name: '', 
    priority: 0, 
    concurrency_limit: 10,
    retry_type: 'exponential',
    max_retries: 3,
    delay_seconds: 5
  });
  const [creating, setCreating] = useState(false);

  const fetchQueues = async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`http://localhost:3000/api/dashboard/queues?project_id=${projectId}`);
      const data = await res.json();
      if (data.status === 'success') {
        setQueues(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch queues', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueues();
    const interval = setInterval(fetchQueues, 5000);
    return () => clearInterval(interval);
  }, [projectId]);

  const handleCreateQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('http://localhost:3000/api/dashboard/queues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newQueue, project_id: projectId })
      });
      if (res.ok) {
        setIsModalOpen(false);
        setNewQueue({ name: '', priority: 0, concurrency_limit: 10, retry_type: 'exponential', max_retries: 3, delay_seconds: 5 });
        fetchQueues();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const handleTogglePause = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await fetch(`http://localhost:3000/api/dashboard/queues/${id}/toggle`, { method: 'POST' });
      fetchQueues();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading queues...</div>;

  return (
    <div>
      <DashboardMetrics />
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Queues</h2>
        <button onClick={() => setIsModalOpen(true)} className="bg-indigo-600 text-white px-4 py-2 rounded shadow hover:bg-indigo-700 transition font-medium">
          Create Queue
        </button>
      </div>
      
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {queues.length === 0 ? (
          <div className="col-span-full text-center text-gray-500 p-8 border-2 border-dashed border-gray-300 rounded-lg">
            No queues found in this project.
          </div>
        ) : queues.map(queue => (
          <div key={queue.id} className="bg-white rounded-lg shadow p-6 border border-gray-200 cursor-pointer hover:shadow-md transition" onClick={() => onSelectQueue(queue.id)}>
            <div className="flex justify-between items-start">
              <h3 className="text-lg font-semibold text-gray-900">{queue.name}</h3>
              <span className={`px-2 py-1 text-xs rounded-full font-medium ${!queue.is_paused ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                {!queue.is_paused ? 'active' : 'paused'}
              </span>
            </div>
            <div className="mt-4 text-sm text-gray-600">
              <p>Priority: {queue.priority}</p>
              <p>Concurrency Limit: {queue.concurrency_limit}</p>
            </div>
            <div className="mt-6 flex gap-2">
              <button 
                onClick={(e) => handleTogglePause(e, queue.id)}
                className="flex-1 bg-gray-100 text-gray-700 py-2 rounded hover:bg-gray-200 transition text-sm font-medium"
              >
                {queue.is_paused ? 'Resume' : 'Pause'}
              </button>
              <button className="flex-1 bg-indigo-50 text-indigo-700 py-2 rounded hover:bg-indigo-100 transition text-sm font-medium">View Jobs</button>
            </div>
          </div>
        ))}
      </div>

      {/* Create Queue Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-lg">Create New Queue</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-gray-800 text-xl font-bold px-2">&times;</button>
            </div>
            <form onSubmit={handleCreateQueue} className="p-6 overflow-y-auto max-h-[80vh]">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Queue Name</label>
                <input required type="text" value={newQueue.name} onChange={e => setNewQueue({...newQueue, name: e.target.value})} className="w-full border-gray-300 rounded-md shadow-sm border p-2 focus:ring-indigo-500 focus:border-indigo-500" placeholder="e.g. Email Processing" />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority (Higher = more important)</label>
                <input required type="number" value={newQueue.priority} onChange={e => setNewQueue({...newQueue, priority: parseInt(e.target.value)})} className="w-full border-gray-300 rounded-md shadow-sm border p-2 focus:ring-indigo-500 focus:border-indigo-500" />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Concurrency Limit</label>
                <input required type="number" min="1" value={newQueue.concurrency_limit} onChange={e => setNewQueue({...newQueue, concurrency_limit: parseInt(e.target.value)})} className="w-full border-gray-300 rounded-md shadow-sm border p-2 focus:ring-indigo-500 focus:border-indigo-500" />
              </div>

              <hr className="my-4" />
              <h4 className="font-semibold text-gray-900 mb-3">Retry Policy</h4>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Retry Strategy</label>
                <select value={newQueue.retry_type} onChange={e => setNewQueue({...newQueue, retry_type: e.target.value})} className="w-full border-gray-300 rounded-md shadow-sm border p-2 focus:ring-indigo-500 focus:border-indigo-500">
                  <option value="fixed">Fixed Delay</option>
                  <option value="linear">Linear Backoff</option>
                  <option value="exponential">Exponential Backoff</option>
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Retries</label>
                <input required type="number" min="0" value={newQueue.max_retries} onChange={e => setNewQueue({...newQueue, max_retries: parseInt(e.target.value)})} className="w-full border-gray-300 rounded-md shadow-sm border p-2 focus:ring-indigo-500 focus:border-indigo-500" />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Base Delay (seconds)</label>
                <input required type="number" min="1" value={newQueue.delay_seconds} onChange={e => setNewQueue({...newQueue, delay_seconds: parseInt(e.target.value)})} className="w-full border-gray-300 rounded-md shadow-sm border p-2 focus:ring-indigo-500 focus:border-indigo-500" />
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded font-medium transition">Cancel</button>
                <button type="submit" disabled={creating} className="px-4 py-2 text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 rounded font-medium transition">
                  {creating ? 'Creating...' : 'Create Queue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
