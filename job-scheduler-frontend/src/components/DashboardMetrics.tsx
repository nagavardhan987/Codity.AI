import React, { useState, useEffect } from 'react';

export default function DashboardMetrics() {
  const [metrics, setMetrics] = useState<any>(null);

  const fetchMetrics = async () => {
    try {
      const res = await fetch('http://localhost:3000/api/dashboard/metrics');
      const data = await res.json();
      if (data.status === 'success') {
        setMetrics(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch metrics', err);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!metrics) return null;

  const totalJobs = metrics.jobStats.reduce((sum: number, stat: any) => sum + Number(stat.count), 0);
  const completedJobs = metrics.jobStats.find((s: any) => s.status === 'completed')?.count || 0;
  const failedJobs = metrics.jobStats.find((s: any) => s.status === 'failed')?.count || 0;
  
  const successRate = totalJobs > 0 ? ((Number(completedJobs) / totalJobs) * 100).toFixed(1) : '0.0';
  
  const activeWorkers = metrics.workerStats.find((s: any) => s.status === 'active')?.count || 0;
  const totalWorkers = metrics.workerStats.reduce((sum: number, stat: any) => sum + Number(stat.count), 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
        <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">Total Jobs</h4>
        <div className="flex items-end gap-2">
          <p className="text-3xl font-bold text-gray-900">{totalJobs}</p>
        </div>
      </div>
      
      <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
        <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">Success Rate</h4>
        <div className="flex items-end gap-2">
          <p className="text-3xl font-bold text-green-600">{successRate}%</p>
          <p className="text-sm text-gray-500 mb-1">{Number(failedJobs)} failed</p>
        </div>
      </div>
      
      <div className="bg-white rounded-lg shadow p-4 border border-gray-200 relative overflow-hidden">
        <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">DLQ Size</h4>
        <div className="flex items-end gap-2">
          <p className={`text-3xl font-bold ${metrics.dlqCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>{metrics.dlqCount}</p>
        </div>
        {metrics.dlqCount > 0 && <div className="absolute top-0 right-0 w-2 h-full bg-red-500"></div>}
      </div>
      
      <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
        <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">Workers</h4>
        <div className="flex justify-between items-end">
          <div className="flex items-end gap-2">
            <p className="text-3xl font-bold text-indigo-600">{Number(activeWorkers)}</p>
            <p className="text-sm text-gray-500 mb-1">/ {totalWorkers} Active</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase">Throughput</p>
            <p className="text-sm font-bold text-gray-700">{metrics.jobsPerMin.toFixed(1)} /min</p>
          </div>
        </div>
      </div>
    </div>
  );
}
