"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "./api";
import { useRouter, usePathname } from "next/navigation";

export interface Organization {
  id: number;
  name: string;
  slug: string;
  pivot?: { role: string };
}

export interface User {
  id: number;
  name: string;
  email: string;
  organizations: Organization[];
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (data: any) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const initAuth = async () => {
      try {
        const data = await api.get('/api/user');
        setUser(data.user);
      } catch (error) {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    initAuth();
  }, []);

  const login = async (data: any) => {
    await api.get('/sanctum/csrf-cookie');
    const res = await api.post('/api/login', data);
    setUser(res.user);
    router.push('/projects');
  };

  const register = async (data: any) => {
    await api.get('/sanctum/csrf-cookie');
    const res = await api.post('/api/register', data);
    setUser(res.user);
    router.push('/projects');
  };

  const logout = async () => {
    await api.post('/api/logout');
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
