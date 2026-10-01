"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useOrg } from "@/components/DashboardLayout";
import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { CopyButton } from "@/components/CopyButton";
import { Plus } from "lucide-react";

export default function ProjectsPage() {
  const { selectedOrgId } = useOrg();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedOrgId) return;
    
    const fetchProjects = async () => {
      setLoading(true);
      try {
        const data = await api.get(`/api/organizations/${selectedOrgId}/projects`);
        setProjects(data.projects);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchProjects();
  }, [selectedOrgId]);

  if (loading) return <div>Loading projects...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
        <Link
          href="/projects/new"
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Project
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border">
          <h3 className="mt-2 text-sm font-medium text-gray-900">No projects</h3>
          <p className="mt-1 text-sm text-gray-500">Get started by creating a new project.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div key={project.id} className="bg-white overflow-hidden shadow rounded-lg border">
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900 truncate">{project.name}</h3>
                  <StatusBadge status={project.status} />
                </div>
                <div className="mb-4">
                  <p className="text-sm text-gray-500 mb-1">App ID</p>
                  <div className="flex items-center space-x-2">
                    <code className="text-xs bg-gray-100 p-1 rounded font-mono">{project.app_id}</code>
                    <CopyButton text={project.app_id} />
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>Auth: {project.auth_mode}</span>
                  <Link href={`/projects/${project.id}`} className="text-blue-600 hover:text-blue-500 font-medium">
                    View details &rarr;
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
