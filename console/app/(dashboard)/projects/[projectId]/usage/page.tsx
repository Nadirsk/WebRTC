"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useOrg } from "@/components/DashboardLayout";
import Link from "next/link";
import { use } from "react";

export default function UsagePage({ params }: { params: Promise<{ projectId: string }> }) {
  const resolvedParams = use(params);
  const { selectedOrgId } = useOrg();
  const [usage, setUsage] = useState<any>(null);
  const [live, setLive] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedOrgId) return;
    
    const fetchUsage = async () => {
      try {
        const [usageData, liveData] = await Promise.all([
          api.get(`/api/organizations/${selectedOrgId}/projects/${resolvedParams.projectId}/usage`),
          api.get(`/api/organizations/${selectedOrgId}/projects/${resolvedParams.projectId}/live`).catch(() => null)
        ]);
        setUsage(usageData);
        setLive(liveData);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchUsage();
    const interval = setInterval(async () => {
      try {
        const liveData = await api.get(`/api/organizations/${selectedOrgId}/projects/${resolvedParams.projectId}/live`);
        setLive(liveData);
      } catch (e) {}
    }, 10000);

    return () => clearInterval(interval);
  }, [selectedOrgId, resolvedParams.projectId]);

  if (loading) return <div>Loading usage data...</div>;
  if (!usage) return <div>Failed to load usage data</div>;

  const maxTotalMinutes = Math.max(...usage.byDay.map((d: any) => d.total_minutes), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-gray-500 mb-1">
            <Link href={`/projects/${resolvedParams.projectId}`} className="hover:underline">&larr; Back to Project</Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Usage Analytics</h1>
        </div>
        <div className="text-sm text-gray-500">
          {usage.from} to {usage.to}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white shadow rounded-lg p-4 border">
          <p className="text-sm text-gray-500">Total Minutes</p>
          <p className="text-2xl font-bold text-gray-900">{usage.totals.totalMinutes.toLocaleString()}</p>
        </div>
        <div className="bg-white shadow rounded-lg p-4 border">
          <p className="text-sm text-gray-500">Audio Minutes</p>
          <p className="text-2xl font-bold text-gray-900">{usage.totals.audioMinutes.toLocaleString()}</p>
        </div>
        <div className="bg-white shadow rounded-lg p-4 border">
          <p className="text-sm text-gray-500">Video Minutes</p>
          <p className="text-2xl font-bold text-gray-900">{usage.totals.videoMinutes.toLocaleString()}</p>
        </div>
        <div className="bg-white shadow rounded-lg p-4 border">
          <p className="text-sm text-gray-500">Total Sessions</p>
          <p className="text-2xl font-bold text-gray-900">{usage.totals.sessions.toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg border p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Daily Minutes (Last 30 Days)</h2>
        <div className="h-64 flex items-end space-x-1 sm:space-x-2">
          {usage.byDay.map((day: any) => {
            const height = `${(day.total_minutes / maxTotalMinutes) * 100}%`;
            return (
              <div key={day.date} className="flex-1 flex flex-col justify-end group relative">
                <div 
                  className="w-full bg-blue-500 rounded-t-sm hover:bg-blue-600 transition-colors"
                  style={{ height: height === "0%" ? "1px" : height }}
                ></div>
                <div className="opacity-0 group-hover:opacity-100 absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10 pointer-events-none">
                  {day.date}: {day.total_minutes} min
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white shadow rounded-lg border p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Live Activity</h2>
        {live ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Concurrent Users</p>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <p className="text-2xl font-bold text-gray-900">{live.concurrentUsers ?? 0}</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500">Active Channels</p>
              <p className="text-2xl font-bold text-gray-900">{live.channels ?? 0}</p>
            </div>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">Waiting for live data...</p>
        )}
      </div>
    </div>
  );
}
