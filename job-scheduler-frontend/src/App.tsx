import React, { useState, useEffect } from 'react';
import QueueList from './components/QueueList';
import WorkerStatus from './components/WorkerStatus';
import JobExplorer from './components/JobExplorer';
import DLQExplorer from './components/DLQExplorer';
import AuthPage from './components/AuthPage';
import ProjectSelector from './components/ProjectSelector';

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('jwt_token'));
  const [activeTab, setActiveTab] = useState('queues');
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string>('');

  const handleLogin = (newToken: string, user: any) => {
    localStorage.setItem('jwt_token', newToken);
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('jwt_token');
    setToken(null);
    setActiveProjectId('');
  };

  if (!token) {
    return <AuthPage onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center space-x-8">
              <h1 className="text-xl font-bold text-indigo-600">Distributed Job Scheduler</h1>
              <ProjectSelector token={token} onProjectSelect={setActiveProjectId} />
            </div>
            <nav className="flex items-center space-x-4">
              <button 
                onClick={() => setActiveTab('queues')}
                className={`px-3 py-2 rounded-md text-sm font-medium ${activeTab === 'queues' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Queues
              </button>
              <button 
                onClick={() => setActiveTab('jobs')}
                className={`px-3 py-2 rounded-md text-sm font-medium ${activeTab === 'jobs' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Jobs
              </button>
              <button 
                onClick={() => setActiveTab('workers')}
                className={`px-3 py-2 rounded-md text-sm font-medium ${activeTab === 'workers' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Workers
              </button>
              <button 
                onClick={() => setActiveTab('dlq')}
                className={`px-3 py-2 rounded-md text-sm font-medium ${activeTab === 'dlq' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Dead Letters
              </button>
              <div className="h-6 w-px bg-gray-300 mx-2"></div>
              <button onClick={handleLogout} className="text-sm font-medium text-gray-500 hover:text-gray-700">Logout</button>
            </nav>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {!activeProjectId && activeTab === 'queues' ? (
          <div className="text-center p-12 bg-white rounded-lg shadow border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">No Project Selected</h3>
            <p className="mt-2 text-sm text-gray-500">Please create or select a project from the top navigation to view and manage queues.</p>
          </div>
        ) : (
          <>
            {activeTab === 'queues' && !selectedQueueId && (
              <QueueList projectId={activeProjectId} onSelectQueue={setSelectedQueueId} />
            )}
            {activeTab === 'queues' && selectedQueueId && (
              <JobExplorer queueId={selectedQueueId} onBack={() => setSelectedQueueId(null)} />
            )}
            {activeTab === 'jobs' && (
              <JobExplorer />
            )}
            {activeTab === 'workers' && (
              <WorkerStatus />
            )}
            {activeTab === 'dlq' && (
              <DLQExplorer />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
