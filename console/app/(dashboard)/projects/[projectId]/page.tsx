"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useOrg } from "@/components/DashboardLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { CopyButton } from "@/components/CopyButton";
import Link from "next/link";
import { use } from "react";

export default function ProjectDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const resolvedParams = use(params);
  const { selectedOrgId } = useOrg();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedOrgId) return;
    
    const fetchProject = async () => {
      try {
        const data = await api.get(`/api/organizations/${selectedOrgId}/projects/${resolvedParams.projectId}`);
        setProject(data.project);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchProject();
  }, [selectedOrgId, resolvedParams.projectId]);

  if (loading) return <div>Loading project...</div>;
  if (!project) return <div>Project not found</div>;

  const primaryCert = project.certificates.find((c: any) => c.is_primary);
  const secondaryCert = project.certificates.find((c: any) => !c.is_primary);

  const rotateCert = async () => {
    if (!confirm("Are you sure you want to rotate the primary certificate? The current one will become secondary.")) return;
    const data = await api.post(`/api/organizations/${selectedOrgId}/projects/${project.id}/rotate-certificate`);
    setProject(data.project);
  };

  const dropSecondary = async () => {
    if (!confirm("Are you sure you want to drop the secondary certificate? Any clients using it will be disconnected.")) return;
    const data = await api.delete(`/api/organizations/${selectedOrgId}/projects/${project.id}/secondary-certificate`);
    setProject(data.project);
  };

  const toggleStatus = async () => {
    const newStatus = project.status === "active" ? "suspended" : "active";
    const data = await api.patch(`/api/organizations/${selectedOrgId}/projects/${project.id}`, { status: newStatus });
    setProject(data.project);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          <div className="mt-1 flex items-center space-x-2">
            <StatusBadge status={project.status} />
            <span className="text-sm text-gray-500">Created {new Date(project.created_at).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="space-x-3">
          <Link href={`/projects/${project.id}/usage`} className="text-sm text-blue-600 hover:underline">Usage</Link>
          <Link href={`/projects/${project.id}/webhooks`} className="text-sm text-blue-600 hover:underline">Webhooks</Link>
          <button onClick={toggleStatus} className="text-sm text-gray-600 hover:text-gray-900 border rounded px-3 py-1">
            {project.status === "active" ? "Suspend" : "Activate"}
          </button>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg border p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Credentials</h2>
        
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">App ID</label>
            <div className="flex items-center space-x-2">
              <code className="bg-gray-100 p-2 rounded block flex-1 font-mono">{project.app_id}</code>
              <CopyButton text={project.app_id} />
            </div>
          </div>

          {project.auth_mode === "token" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Primary Certificate</label>
                <button onClick={rotateCert} className="text-xs text-blue-600 hover:underline">Rotate Certificate</button>
              </div>
              <div className="flex items-center space-x-2">
                <code className="bg-gray-100 p-2 rounded block flex-1 font-mono">
                  {primaryCert?.secret || "No primary certificate"}
                </code>
                {primaryCert && <CopyButton text={primaryCert.secret} />}
              </div>
              <p className="text-xs text-gray-500 mt-1">Used to generate access tokens for your clients.</p>
            </div>
          )}

          {secondaryCert && (
            <div className="pt-4 border-t">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700 text-orange-600">Secondary Certificate</label>
                <button onClick={dropSecondary} className="text-xs text-red-600 hover:underline">Drop Secondary</button>
              </div>
              <div className="flex items-center space-x-2">
                <code className="bg-orange-50 p-2 rounded block flex-1 font-mono text-orange-800 border border-orange-200">
                  {secondaryCert.secret}
                </code>
                <CopyButton text={secondaryCert.secret} />
              </div>
              <p className="text-xs text-gray-500 mt-1">Will be rejected once dropped. Update your servers to use the new primary certificate.</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white shadow rounded-lg border p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Configuration</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Auth Mode</p>
            <p className="font-medium">{project.auth_mode === "token" ? "Token Authentication (Secure)" : "App ID Only (Testing)"}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Max Concurrent Users</p>
            <p className="font-medium">{project.max_concurrent_users.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Max Channels</p>
            <p className="font-medium">{project.max_channels.toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
