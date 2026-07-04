import React, { useState, useEffect } from 'react';

interface ProjectSelectorProps {
  token: string;
  onProjectSelect: (projectId: string) => void;
}

export default function ProjectSelector({ token, onProjectSelect }: ProjectSelectorProps) {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetchOrgs();
  }, [token]);

  const fetchOrgs = async () => {
    try {
      const res = await fetch('http://localhost:4000/api/orgs', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.status === 'success' && data.data.organizations.length > 0) {
        setOrgs(data.data.organizations);
        const defaultOrgId = data.data.organizations[0].id;
        setSelectedOrgId(defaultOrgId);
        fetchProjects(defaultOrgId);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProjects = async (orgId: string) => {
    try {
      const res = await fetch(`http://localhost:4000/api/projects/org/${orgId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.status === 'success') {
        setProjects(data.data.projects);
        if (data.data.projects.length > 0) {
          const defaultProjectId = data.data.projects[0].id;
          setSelectedProjectId(defaultProjectId);
          onProjectSelect(defaultProjectId);
        } else {
          setSelectedProjectId('');
          onProjectSelect('');
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    try {
      const res = await fetch('http://localhost:4000/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ org_id: selectedOrgId, name: newProjectName })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setNewProjectName('');
        setIsCreating(false);
        fetchProjects(selectedOrgId);
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="text-sm text-gray-500">Loading projects...</div>;

  return (
    <div className="flex items-center space-x-4">
      {projects.length > 0 ? (
        <select
          value={selectedProjectId}
          onChange={(e) => {
            setSelectedProjectId(e.target.value);
            onProjectSelect(e.target.value);
          }}
          className="block w-48 pl-3 pr-10 py-2 text-sm border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-md"
        >
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      ) : (
        <span className="text-sm text-red-500">No projects found.</span>
      )}
      
      {isCreating ? (
        <form onSubmit={handleCreateProject} className="flex items-center space-x-2">
          <input
            type="text"
            placeholder="Project Name..."
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            className="block w-32 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
          <button type="submit" className="text-xs bg-indigo-600 text-white px-2 py-1 rounded">Save</button>
          <button type="button" onClick={() => setIsCreating(false)} className="text-xs text-gray-500">Cancel</button>
        </form>
      ) : (
        <button
          onClick={() => setIsCreating(true)}
          className="text-sm text-indigo-600 hover:text-indigo-900 font-medium"
        >
          + New Project
        </button>
      )}
    </div>
  );
}
