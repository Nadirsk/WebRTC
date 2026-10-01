"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useOrg } from "@/components/DashboardLayout";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewProjectPage() {
  const { selectedOrgId } = useOrg();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    auth_mode: "token",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId) return;
    
    setLoading(true);
    try {
      const data = await api.post(`/api/organizations/${selectedOrgId}/projects`, formData);
      router.push(`/projects/${data.project.id}`);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Create Project</h1>
        <Link href="/projects" className="text-sm text-gray-500 hover:text-gray-700">Cancel</Link>
      </div>

      <div className="bg-white shadow rounded-lg border p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Project Name</label>
            <input
              type="text"
              required
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Production, Staging, My App"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Authentication Mode</label>
            <div className="space-y-4">
              <label className="flex items-start">
                <input
                  type="radio"
                  className="mt-1 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  checked={formData.auth_mode === "token"}
                  onChange={() => setFormData({ ...formData, auth_mode: "token" })}
                />
                <div className="ml-3">
                  <span className="block text-sm font-medium text-gray-900">Token Authentication (Recommended)</span>
                  <span className="block text-sm text-gray-500">
                    Use App ID and Certificate to generate secure access tokens on your backend.
                  </span>
                </div>
              </label>

              <label className="flex items-start">
                <input
                  type="radio"
                  className="mt-1 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  checked={formData.auth_mode === "appIdOnly"}
                  onChange={() => setFormData({ ...formData, auth_mode: "appIdOnly" })}
                />
                <div className="ml-3">
                  <span className="block text-sm font-medium text-gray-900">App ID Only (Testing)</span>
                  <span className="block text-sm text-gray-500">
                    Allows connections using just the App ID. Not recommended for production.
                  </span>
                </div>
              </label>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-200 flex justify-end">
            <button
              type="submit"
              disabled={loading || !formData.name}
              className="bg-blue-600 border border-transparent rounded-md shadow-sm py-2 px-4 inline-flex justify-center text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
