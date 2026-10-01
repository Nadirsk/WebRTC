"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useOrg } from "@/components/DashboardLayout";
import Link from "next/link";
import { use } from "react";

export default function WebhooksPage({ params }: { params: Promise<{ projectId: string }> }) {
  const resolvedParams = use(params);
  const { selectedOrgId } = useOrg();
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ url: "", is_enabled: true, events: ["channel.created", "channel.destroyed"] });

  const fetchWebhooks = async () => {
    try {
      const data = await api.get(`/api/organizations/${selectedOrgId}/projects/${resolvedParams.projectId}/webhooks`);
      setWebhooks(data.webhooks);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedOrgId) fetchWebhooks();
  }, [selectedOrgId, resolvedParams.projectId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post(`/api/organizations/${selectedOrgId}/projects/${resolvedParams.projectId}/webhooks`, formData);
    setShowForm(false);
    fetchWebhooks();
  };

  const deleteWebhook = async (id: number) => {
    if (!confirm("Delete this webhook?")) return;
    await api.delete(`/api/organizations/${selectedOrgId}/projects/${resolvedParams.projectId}/webhooks/${id}`);
    fetchWebhooks();
  };

  if (loading) return <div>Loading webhooks...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-gray-500 mb-1">
            <Link href={`/projects/${resolvedParams.projectId}`} className="hover:underline">&larr; Back to Project</Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>
        </div>
        <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700">
          Add Webhook
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 shadow border rounded-lg space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Payload URL</label>
            <input 
              type="url" required 
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm py-2 px-3 border"
              value={formData.url} onChange={e => setFormData({...formData, url: e.target.value})}
              placeholder="https://your-server.com/webhooks"
            />
          </div>
          <div className="flex items-center">
            <input 
              type="checkbox" 
              checked={formData.is_enabled} onChange={e => setFormData({...formData, is_enabled: e.target.checked})}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded"
            />
            <label className="ml-2 text-sm text-gray-700">Enabled</label>
          </div>
          <div className="flex justify-end space-x-3">
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-gray-600">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded text-sm">Save</button>
          </div>
        </form>
      )}

      {webhooks.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border">
          <p className="text-sm text-gray-500">No webhooks configured.</p>
        </div>
      ) : (
        <div className="bg-white shadow border rounded-lg">
          <ul className="divide-y divide-gray-200">
            {webhooks.map((webhook) => (
              <li key={webhook.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{webhook.url}</p>
                  <p className="text-sm text-gray-500 flex space-x-2 mt-1">
                    <span className={webhook.is_enabled ? "text-green-600" : "text-gray-400"}>
                      {webhook.is_enabled ? "Enabled" : "Disabled"}
                    </span>
                    <span>•</span>
                    <span>{webhook.events.join(", ")}</span>
                  </p>
                </div>
                <button onClick={() => deleteWebhook(webhook.id)} className="text-red-600 text-sm hover:underline">Delete</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
