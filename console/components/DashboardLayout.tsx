"use client";

import { useAuth } from "@/lib/auth";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Key, BookOpen, LogOut } from "lucide-react";
import { ReactNode, useState, useEffect, createContext, useContext } from "react";

const OrgContext = createContext<{ selectedOrgId: number | null, setSelectedOrgId: (id: number) => void }>({ selectedOrgId: null, setSelectedOrgId: () => {} });

export function useOrg() {
  return useContext(OrgContext);
}

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, logout, loading } = useAuth();
  const pathname = usePathname();
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);

  useEffect(() => {
    if (user && user.organizations.length > 0 && !selectedOrgId) {
      setSelectedOrgId(user.organizations[0].id);
    }
  }, [user, selectedOrgId]);

  if (loading || !user) return <div className="h-screen flex items-center justify-center bg-gray-50">Loading...</div>;

  const navLinks = [
    { href: "/projects", label: "Projects", icon: LayoutDashboard },
    { href: "/team", label: "Team", icon: Users },
    { href: "/credentials", label: "API Credentials", icon: Key },
  ];

  return (
    <OrgContext.Provider value={{ selectedOrgId, setSelectedOrgId }}>
      <div className="flex h-screen bg-gray-50">
        <aside className="w-64 bg-slate-900 text-white flex flex-col">
          <div className="p-6 border-b border-slate-800">
            <h1 className="text-xl font-bold">Nadir Network</h1>
          </div>
          
          <div className="p-4 border-b border-slate-800">
            <select 
              className="w-full bg-slate-800 text-sm rounded p-2 text-white border border-slate-700"
              value={selectedOrgId || ""}
              onChange={(e) => setSelectedOrgId(Number(e.target.value))}
            >
              {user.organizations.map(org => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </select>
          </div>

          <nav className="flex-1 p-4 space-y-1">
            {navLinks.map((link) => {
              const isActive = pathname.startsWith(link.href);
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center px-4 py-2 text-sm rounded-md transition-colors ${
                    isActive ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <Icon className="w-5 h-5 mr-3" />
                  {link.label}
                </Link>
              );
            })}
            <a
              href="http://localhost:3100/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center px-4 py-2 text-sm rounded-md text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <BookOpen className="w-5 h-5 mr-3" />
              Docs
            </a>
          </nav>
        </aside>

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="h-16 bg-white border-b flex items-center justify-between px-8">
            <div className="flex-1"></div>
            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium text-gray-700">{user.name}</span>
              <button
                onClick={logout}
                className="text-gray-500 hover:text-gray-700 transition-colors flex items-center"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </header>
          <div className="flex-1 overflow-auto p-8">
            <div className="max-w-5xl mx-auto">
              {children}
            </div>
          </div>
        </main>
      </div>
    </OrgContext.Provider>
  );
}
