import React, { useState, useEffect } from 'react';

export default function JobExplorer({ queueId, onBack }: { queueId?: string, onBack?: () => void }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Logs Modal State
  const [logsJobId, setLogsJobId] = useState<string | null>(null);
  const [logsData, setLogsData] = useState<any | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Submit Job Modal State
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [newJob, setNewJob] = useState({ type: 'immediate', delaySeconds: 0, payload: '{}', shouldFail: false, batchCount: 3 });
  const [submitting, setSubmitting] = useState(false);

  const [queues, setQueues] = useState<any[]>([]);
  const [selectedQueueId, setSelectedQueueId] = useState<string>(queueId || '');

  // Computed state for pagination and search
  const filteredJobs = jobs.filter(j => {
    if (filter !== 'all' && j.status !== filter) return false;
    if (search) {
      const searchLower = search.toLowerCase();
      const inId = j.id.toLowerCase().includes(searchLower);
      const inPayload = j.payload && typeof j.payload === 'object' && JSON.stringify(j.payload).toLowerCase().includes(searchLower);
      if (!inId && !inPayload) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(filteredJobs.length / pageSize) || 1;
  const paginatedJobs = filteredJobs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const fetchJobs = async () => {
    try {
      const url = queueId 
        ? `http://localhost:3000/api/dashboard/jobs?queue_id=${queueId}` 
        : `http://localhost:3000/api/dashboard/jobs`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === 'success') {
        setJobs(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch jobs', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchQueues = async () => {
    if (!queueId) {
      try {
        const res = await fetch('http://localhost:3000/api/dashboard/queues');
        const data = await res.json();
        if (data.status === 'success') {
          setQueues(data.data);
          if (data.data.length > 0 && !selectedQueueId) {
            setSelectedQueueId(data.data[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to fetch queues', err);
      }
    }
  };

  const fetchLogs = async (id: string) => {
    setLogsJobId(id);
    setLoadingLogs(true);
    setLogsData(null);
    try {
      const res = await fetch(`http://localhost:3000/api/dashboard/jobs/${id}/logs`);
      const data = await res.json();
      if (data.status === 'success') {
        setLogsData(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch logs', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleRetry = async (id: string) => {
    try {
      await fetch(`http://localhost:3000/api/dashboard/jobs/${id}/retry`, { method: 'POST' });
      fetchJobs();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmitJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQueueId) {
      alert("Please select a queue");
      return;
    }
    setSubmitting(true);
    try {
      let parsedPayload: any = {};
      try {
        parsedPayload = JSON.parse(newJob.payload);
      } catch (err) {
        alert("Payload must be valid JSON");
        setSubmitting(false);
        return;
      }
      
      if (newJob.shouldFail) {
        parsedPayload.shouldFail = true;
      }

      let jobsToSubmit = [parsedPayload];
      
      if (newJob.type === 'batch') {
        jobsToSubmit = [];
        const batchId = `batch-${Date.now()}`;
        for (let i = 1; i <= (newJob.batchCount || 3); i++) {
          jobsToSubmit.push({ ...parsedPayload, batch_id: batchId, batch_index: i });
        }
      }

      for (const payload of jobsToSubmit) {
        await fetch('http://localhost:3000/api/dashboard/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            queue_id: selectedQueueId,
            type: newJob.type === 'batch' ? 'immediate' : newJob.type,
            delaySeconds: newJob.type === 'delayed' ? newJob.delaySeconds : undefined,
            run_at: payload.run_at_input,
            cron_expression: payload.cron,
            payload: payload
          })
        });
      }
      
      setIsSubmitOpen(false);
      setNewJob({ type: 'immediate', delaySeconds: 0, payload: '{}', shouldFail: false, batchCount: 3 });
      fetchJobs();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    fetchQueues();
    const interval = setInterval(fetchJobs, 3000);
    return () => clearInterval(interval);
  }, [queueId]);

  if (loading) return <div className="p-8 text-center text-gray-500">Loading jobs...</div>;

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        {onBack && (
          <button onClick={onBack} className="text-gray-500 hover:text-gray-900 transition flex items-center gap-1 font-medium">
            ← Back to Queues
          </button>
        )}
        <h2 className={`text-2xl font-bold text-gray-900 ${onBack ? 'border-l pl-4 border-gray-300' : ''}`}>
          {queueId ? 'Jobs in Queue' : 'All Jobs'}
        </h2>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden relative">
        <div className="p-4 border-b border-gray-200 flex flex-col md:flex-row gap-4 justify-between items-center bg-gray-50 overflow-x-auto">
          <div className="flex flex-wrap gap-2">
            {['all', 'queued', 'scheduled', 'claimed', 'running', 'completed', 'failed', 'dead_letter'].map(status => (
              <button 
                key={status}
                onClick={() => { setFilter(status); setCurrentPage(1); }}
                className={`px-3 py-1 text-sm rounded-full capitalize font-medium transition whitespace-nowrap ${filter === status ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
              >
                {status.replace('_', ' ')}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <input 
              type="text"
              placeholder="Search ID..."
              value={search}
              onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm w-full md:w-48 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button onClick={() => setIsSubmitOpen(true)} className="bg-indigo-600 text-white px-4 py-1.5 rounded shadow-sm hover:bg-indigo-700 transition text-sm font-medium whitespace-nowrap">
              Submit Job
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-sm text-gray-600 uppercase tracking-wider">
                <th className="p-4 font-semibold">Job ID</th>
                <th className="p-4 font-semibold">Type</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold">Attempts</th>
                <th className="p-4 font-semibold">Created</th>
                <th className="p-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedJobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">No jobs found matching criteria.</td>
                </tr>
              ) : paginatedJobs.map(job => (
                <tr key={job.id} className="hover:bg-gray-50 transition">
                  <td className="p-4 font-mono text-sm text-gray-900">{job.id.substring(0, 8)}...</td>
                  <td className="p-4 text-sm text-gray-600 capitalize">{job.type}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                      job.status === 'completed' ? 'bg-green-100 text-green-800' :
                      job.status === 'failed' ? 'bg-red-100 text-red-800' :
                      job.status === 'dead_letter' ? 'bg-gray-800 text-gray-100' :
                      job.status === 'scheduled' ? 'bg-purple-100 text-purple-800' :
                      job.status === 'claimed' ? 'bg-yellow-100 text-yellow-800' :
                      job.status === 'running' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800' // queued
                    }`}>
                      {job.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-gray-600">{job.attempts}</td>
                  <td className="p-4 text-sm text-gray-500 whitespace-nowrap">{new Date(job.created_at).toLocaleString()}</td>
                  <td className="p-4 text-right space-x-2">
                    <button onClick={() => fetchLogs(job.id)} className="text-indigo-600 hover:text-indigo-900 text-sm font-medium transition">View Logs</button>
                    {job.status === 'failed' || job.status === 'dead_letter' ? (
                      <button onClick={() => handleRetry(job.id)} className="text-orange-600 hover:text-orange-900 text-sm font-medium transition">Retry</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
            <span className="text-sm text-gray-600">
              Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredJobs.length)} of {filteredJobs.length} jobs
            </span>
            <div className="flex space-x-1">
              <button 
                disabled={currentPage === 1} 
                onClick={() => setCurrentPage(c => c - 1)}
                className="px-3 py-1 border rounded bg-white text-gray-600 disabled:opacity-50 hover:bg-gray-100"
              >
                Previous
              </button>
              <button 
                disabled={currentPage === totalPages} 
                onClick={() => setCurrentPage(c => c + 1)}
                className="px-3 py-1 border rounded bg-white text-gray-600 disabled:opacity-50 hover:bg-gray-100"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Submit Job Modal */}
      {isSubmitOpen && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-lg">Submit New Job</h3>
              <button onClick={() => setIsSubmitOpen(false)} className="text-gray-500 hover:text-gray-800 text-xl font-bold px-2">&times;</button>
            </div>
            <form onSubmit={handleSubmitJob} className="p-6">
              {!queueId && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Queue</label>
                  <select value={selectedQueueId} onChange={e => setSelectedQueueId(e.target.value)} required className="w-full border-gray-300 rounded-md shadow-sm border p-2 focus:ring-indigo-500 focus:border-indigo-500">
                    <option value="" disabled>Select a queue</option>
                    {queues.map(q => (
                      <option key={q.id} value={q.id}>{q.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Job Type</label>
                <select value={newJob.type} onChange={e => setNewJob({...newJob, type: e.target.value})} className="w-full border-gray-300 rounded-md shadow-sm border p-2 focus:ring-indigo-500 focus:border-indigo-500">
                  <option value="immediate">Immediate</option>
                  <option value="delayed">Delayed</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="recurring">Recurring (Cron)</option>
                  <option value="batch">Batch (Submits 3 Jobs)</option>
                </select>
              </div>
              
              {newJob.type === 'delayed' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Delay (seconds)</label>
                  <input required type="number" min="1" value={newJob.delaySeconds || 10} onChange={e => setNewJob({...newJob, delaySeconds: parseInt(e.target.value)})} className="w-full border-gray-300 rounded-md shadow-sm border p-2 focus:ring-indigo-500 focus:border-indigo-500" />
                </div>
              )}
              
              {newJob.type === 'scheduled' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Run At</label>
                  <input required type="datetime-local" onChange={e => setNewJob({...newJob, payload: JSON.stringify({ ...JSON.parse(newJob.payload || '{}'), run_at_input: e.target.value })})} className="w-full border-gray-300 rounded-md shadow-sm border p-2 focus:ring-indigo-500 focus:border-indigo-500" />
                </div>
              )}

              {newJob.type === 'recurring' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cron Expression</label>
                  <input required type="text" placeholder="* * * * *" onChange={e => setNewJob({...newJob, payload: JSON.stringify({ ...JSON.parse(newJob.payload || '{}'), cron: e.target.value })})} className="w-full border-gray-300 rounded-md shadow-sm border p-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono" />
                </div>
              )}
              
              {newJob.type === 'batch' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Number of Jobs in Batch</label>
                  <input required type="number" min="2" max="100" value={newJob.batchCount} onChange={e => setNewJob({...newJob, batchCount: parseInt(e.target.value)})} className="w-full border-gray-300 rounded-md shadow-sm border p-2 focus:ring-indigo-500 focus:border-indigo-500" />
                </div>
              )}

              <div className="mb-4 flex items-center">
                <input type="checkbox" id="forceFail" checked={newJob.shouldFail} onChange={e => setNewJob({...newJob, shouldFail: e.target.checked})} className="mr-2 h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
                <label htmlFor="forceFail" className="text-sm font-medium text-red-600">Force Failure (DLQ Test)</label>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Payload (JSON)</label>
                <textarea rows={4} required value={newJob.payload} onChange={e => setNewJob({...newJob, payload: e.target.value})} className="w-full border-gray-300 rounded-md shadow-sm border p-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm" />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setIsSubmitOpen(false)} className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded font-medium transition">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 rounded font-medium transition">
                  {submitting ? 'Submitting...' : 'Submit Job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Logs Modal */}
      {logsJobId && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-lg">Job Details: {logsJobId.substring(0, 8)}</h3>
              <button onClick={() => setLogsJobId(null)} className="text-gray-500 hover:text-gray-800 text-xl font-bold px-2">&times;</button>
            </div>
            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
              <div className="md:w-1/3 bg-gray-50 p-4 border-r border-gray-200 overflow-y-auto">
                <h4 className="font-bold text-gray-700 text-sm mb-3 uppercase tracking-wider">Job Context</h4>
                {!loadingLogs && logsData && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-medium text-gray-500">Max Retries</p>
                      <p className="text-sm text-gray-900 font-mono">
                        {logsData.job?.max_retries !== null ? logsData.job?.max_retries : logsData.job?.queue_retries}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Payload</p>
                      <div className="bg-gray-800 rounded p-2 overflow-x-auto text-xs font-mono text-green-400">
                        <pre>{JSON.stringify(logsData.job?.payload, null, 2)}</pre>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="md:w-2/3 p-4 overflow-y-auto bg-gray-900 text-gray-100 font-mono text-sm flex-1">
                {loadingLogs ? (
                  <div className="text-gray-400">Loading logs...</div>
                ) : logsData?.groupedLogs && logsData.groupedLogs.length === 0 ? (
                  <div className="text-gray-400 italic">No execution logs found for this job. It may not have run yet.</div>
                ) : (
                  logsData?.groupedLogs?.map((exec: any, i: number) => {
                    const firstLog = exec.logs[0];
                    const lastLog = exec.logs[exec.logs.length - 1];
                    let durationText = '';
                    if (firstLog && lastLog) {
                      const durationMs = new Date(lastLog.timestamp).getTime() - new Date(firstLog.timestamp).getTime();
                      durationText = ` (${(durationMs / 1000).toFixed(2)}s)`;
                    }

                    return (
                      <div key={i} className="mb-6">
                        <div className="flex justify-between items-end border-b border-gray-700 pb-1 mb-2">
                          <div className="text-indigo-400 font-bold">
                            Attempt {exec.execution.attempt_number} 
                            {exec.execution.status === 'failed' ? ' ❌ Failed' : exec.execution.status === 'completed' ? ' ✅ Success' : ' ⏳ Running'}
                            <span className="text-gray-400 font-normal ml-2">{durationText}</span>
                          </div>
                          <div className="text-xs text-gray-500">
                            Worker: <span className="text-gray-300">{exec.execution.worker_id || 'Unknown'}</span>
                          </div>
                        </div>
                        {exec.logs.map((log: any, j: number) => (
                          <div key={j} className="flex gap-3 mb-1">
                            <span className="text-gray-500 whitespace-nowrap">[{new Date(log.timestamp).toISOString().split('T')[1].substring(0,12)}]</span>
                            <span className={log.log_level === 'error' ? 'text-red-400' : log.log_level === 'warn' ? 'text-yellow-400' : 'text-gray-200'}>
                              {log.message}
                            </span>
                          </div>
                        ))}
                        {exec.execution.error_details && (
                          <div className="mt-2 p-2 bg-red-900/30 border border-red-800 rounded text-red-300">
                            {JSON.parse(exec.execution.error_details).message}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
