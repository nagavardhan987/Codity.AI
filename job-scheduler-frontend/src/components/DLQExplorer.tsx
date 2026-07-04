import React, { useState, useEffect } from 'react';

export default function DLQExplorer() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const fetchDLQ = async () => {
    try {
      const res = await fetch('http://localhost:4000/api/dashboard/dlq');
      const data = await res.json();
      if (data.status === 'success') {
        setJobs(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch DLQ', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRequeue = async (jobId: string) => {
    try {
      await fetch(`http://localhost:4000/api/dashboard/dlq/${jobId}/requeue`, { method: 'POST' });
      fetchDLQ();
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchDLQ();
    const interval = setInterval(fetchDLQ, 3000);
    return () => clearInterval(interval);
  }, []);

  const filteredJobs = jobs.filter(j => 
    !search || j.job_id.toLowerCase().includes(search.toLowerCase())
  );
  
  const totalPages = Math.ceil(filteredJobs.length / pageSize) || 1;
  const paginatedJobs = filteredJobs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  if (loading) return <div className="p-8 text-center text-gray-500">Loading dead letters...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Dead Letter Queue</h2>
        <input 
          type="text"
          placeholder="Search Job ID..."
          value={search}
          onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm w-full md:w-64 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden relative">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-sm text-gray-600 uppercase tracking-wider">
                <th className="p-4 font-semibold">Job ID</th>
                <th className="p-4 font-semibold">Type</th>
                <th className="p-4 font-semibold">Reason</th>
                <th className="p-4 font-semibold">Moved At</th>
                <th className="p-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedJobs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">No dead letter jobs found.</td>
                </tr>
              ) : paginatedJobs.map(job => (
                <tr key={job.dlq_id} className="hover:bg-gray-50 transition">
                  <td className="p-4 font-mono text-sm text-gray-900">{job.job_id.substring(0, 8)}...</td>
                  <td className="p-4 text-sm text-gray-600 capitalize">{job.type}</td>
                  <td className="p-4 text-sm text-red-600 font-mono truncate max-w-xs" title={job.reason}>{job.reason}</td>
                  <td className="p-4 text-sm text-gray-500 whitespace-nowrap">{new Date(job.created_at).toLocaleString()}</td>
                  <td className="p-4 text-right">
                    <button onClick={() => handleRequeue(job.job_id)} className="text-indigo-600 hover:text-indigo-900 text-sm font-medium transition">Requeue</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
