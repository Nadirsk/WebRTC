"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useOrg } from "@/components/DashboardLayout";

export default function TeamPage() {
  const { selectedOrgId } = useOrg();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("developer");

  const fetchMembers = async () => {
    try {
      const data = await api.get(`/api/organizations/${selectedOrgId}/members`);
      setMembers(data.members);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedOrgId) fetchMembers();
  }, [selectedOrgId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post(`/api/organizations/${selectedOrgId}/members`, { email, role });
    setEmail("");
    fetchMembers();
  };

  const removeMember = async (userId: number) => {
    if (!confirm("Remove this member?")) return;
    await api.delete(`/api/organizations/${selectedOrgId}/members/${userId}`);
    fetchMembers();
  };

  if (loading) return <div>Loading team...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Team</h1>

      <div className="bg-white p-6 shadow border rounded-lg">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Add Member</h2>
        <form onSubmit={handleAdd} className="flex space-x-4">
          <input 
            type="email" required placeholder="Email address"
            className="flex-1 border-gray-300 rounded-md shadow-sm py-2 px-3 border"
            value={email} onChange={e => setEmail(e.target.value)}
          />
          <select 
            className="border-gray-300 rounded-md shadow-sm py-2 px-3 border"
            value={role} onChange={e => setRole(e.target.value)}
          >
            <option value="developer">Developer</option>
            <option value="admin">Admin</option>
            <option value="billing">Billing</option>
          </select>
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded text-sm">Add</button>
        </form>
      </div>

      <div className="bg-white shadow border rounded-lg">
        <ul className="divide-y divide-gray-200">
          {members.map((member) => (
            <li key={member.id} className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{member.name}</p>
                <p className="text-sm text-gray-500">{member.email}</p>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-500 capitalize">{member.pivot.role}</span>
                {member.pivot.role !== 'owner' && (
                  <button onClick={() => removeMember(member.id)} className="text-red-600 text-sm hover:underline">Remove</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
