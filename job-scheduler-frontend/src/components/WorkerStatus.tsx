import React, { useState, useEffect } from 'react';

export default function WorkerStatus() {
  const [workers, setWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 6;

  const fetchWorkers = async () => {
    try {
      const res = await fetch('http://localhost:3000/api/dashboard/workers');
      const data = await res.json();
      if (data.status === 'success') {
        setWorkers(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch workers', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkers();
    const interval = setInterval(fetchWorkers, 3000);
    return () => clearInterval(interval);
  }, []);

  const filteredWorkers = workers.filter(w => 
    !search || w.id.toLowerCase().includes(search.toLowerCase()) || w.hostname.toLowerCase().includes(search.toLowerCase())
  );
  
  const totalPages = Math.ceil(filteredWorkers.length / pageSize) || 1;
  const paginatedWorkers = filteredWorkers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  if (loading) return <div className="p-8 text-center text-gray-500">Loading workers...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Worker Nodes</h2>
        <input 
          type="text"
          placeholder="Search Worker ID or Hostname..."
          value={search}
          onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm w-full md:w-64 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2 mb-6">
        {paginatedWorkers.length === 0 ? (
          <div className="col-span-full text-center text-gray-500 p-8 border-2 border-dashed border-gray-300 rounded-lg">
            No workers found matching criteria.
          </div>
        ) : paginatedWorkers.map(worker => {
          // Calculate time since last heartbeat
          let heartbeatTime = worker.last_heartbeat;
          if (heartbeatTime && !heartbeatTime.endsWith('Z')) {
            heartbeatTime += 'Z';
          }
          const secondsAgo = heartbeatTime
            ? Math.floor((Date.now() - new Date(heartbeatTime).getTime()) / 1000)
            : null;
            
          const heartbeatText = secondsAgo !== null 
            ? `${secondsAgo} seconds ago` 
            : 'Never';

          return (
            <div key={worker.id} className={`bg-white rounded-lg shadow p-6 border transition ${worker.status === 'active' ? 'border-green-200' : 'border-red-200'}`}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 font-mono text-sm">{worker.id}</h3>
                  <p className="text-sm text-gray-500 mt-1">{worker.hostname}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${worker.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {worker.status}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mt-6 p-4 bg-gray-50 rounded">
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Active Jobs</p>
                  <p className="text-2xl font-semibold text-gray-900 mt-1">{worker.activeJobsCount || 0}</p>
                  {worker.activeJobId && (
                    <p className="text-xs text-indigo-600 mt-1 font-mono truncate max-w-full" title={worker.activeJobId}>
                      Processing: {worker.activeJobId.substring(0, 8)}...
                    </p>
                  )}
                  {worker.assignedQueues && worker.assignedQueues.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {worker.assignedQueues.map((q: any) => (
                        <span key={q.id} className="px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded text-xs font-medium">
                          {q.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Last Heartbeat</p>
                  <p className="text-sm font-medium text-gray-900 mt-2">{heartbeatText}</p>
                  {worker.cpu_usage != null && (
                    <p className="text-xs text-gray-400 mt-1">CPU: {Number(worker.cpu_usage).toFixed(2)} | RAM: {Number(worker.memory_usage).toFixed(0)}MB</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between p-4 bg-white rounded-lg shadow border border-gray-200">
          <span className="text-sm text-gray-600">
            Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredWorkers.length)} of {filteredWorkers.length} workers
          </span>
          <div className="flex space-x-2">
            <button 
              disabled={currentPage === 1} 
              onClick={() => setCurrentPage(c => c - 1)}
              className="px-4 py-2 border rounded bg-white text-gray-700 disabled:opacity-50 hover:bg-gray-50 font-medium text-sm transition"
            >
              Previous
            </button>
            <button 
              disabled={currentPage === totalPages} 
              onClick={() => setCurrentPage(c => c + 1)}
              className="px-4 py-2 border rounded bg-white text-gray-700 disabled:opacity-50 hover:bg-gray-50 font-medium text-sm transition"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
