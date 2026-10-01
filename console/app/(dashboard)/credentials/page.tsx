"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useOrg } from "@/components/DashboardLayout";
import { CopyButton } from "@/components/CopyButton";

export default function CredentialsPage() {
  const { selectedOrgId } = useOrg();
  const [credentials, setCredentials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCred, setNewCred] = useState<any>(null);

  const fetchCredentials = async () => {
    try {
      const data = await api.get(`/api/organizations/${selectedOrgId}/api-credentials`);
      setCredentials(data.credentials);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedOrgId) fetchCredentials();
  }, [selectedOrgId]);

  const generateCredential = async () => {
    const data = await api.post(`/api/organizations/${selectedOrgId}/api-credentials`);
    setNewCred(data.credential);
    fetchCredentials();
  };

  const revokeCredential = async (id: number) => {
    if (!confirm("Revoke this credential? Any scripts using it will break.")) return;
    await api.delete(`/api/organizations/${selectedOrgId}/api-credentials/${id}`);
    fetchCredentials();
  };

  if (loading) return <div>Loading credentials...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">API Credentials</h1>
        <button onClick={generateCredential} className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700">
          Generate New Credential
        </button>
      </div>

      {newCred && (
        <div className="bg-green-50 border border-green-200 p-6 rounded-lg mb-6">
          <h3 className="text-green-800 font-medium mb-2">New Credential Generated</h3>
          <p className="text-sm text-green-700 mb-4">Please copy your secret now. It will never be shown again.</p>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-green-700 mb-1">Key ID</p>
              <div className="flex items-center space-x-2">
                <code className="bg-white px-2 py-1 rounded font-mono border text-sm">{newCred.key}</code>
                <CopyButton text={newCred.key} />
              </div>
            </div>
            <div>
              <p className="text-xs text-green-700 mb-1">Secret Key</p>
              <div className="flex items-center space-x-2">
                <code className="bg-white px-2 py-1 rounded font-mono border text-sm">{newCred.secret}</code>
                <CopyButton text={newCred.secret} />
              </div>
            </div>
          </div>
          <button onClick={() => setNewCred(null)} className="mt-4 text-sm text-green-700 hover:underline">
            I have copied my secret
          </button>
        </div>
      )}

      <div className="bg-white shadow border rounded-lg">
        {credentials.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">No credentials found.</div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {credentials.map((cred) => (
              <li key={cred.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium font-mono text-gray-900">{cred.key}</p>
                  <p className="text-sm text-gray-500">Created {new Date(cred.created_at).toLocaleDateString()}</p>
                </div>
                <button onClick={() => revokeCredential(cred.id)} className="text-red-600 text-sm hover:underline">Revoke</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
