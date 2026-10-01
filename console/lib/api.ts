export class ApiError extends Error {
  constructor(public status: number, public message: string, public errors?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010';

export const api = {
  async fetch(endpoint: string, options: RequestInit = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`;
    
    let csrfToken = '';
    if (typeof document !== 'undefined') {
      const match = document.cookie.match(new RegExp('(^| )XSRF-TOKEN=([^;]+)'));
      if (match) csrfToken = decodeURIComponent(match[2]);
    }

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>,
    };

    if (csrfToken) {
      headers['X-XSRF-TOKEN'] = csrfToken;
    }

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      let message = response.statusText;
      let errors;
      try {
        const data = await response.json();
        message = data.message || message;
        errors = data.errors;
      } catch (e) {}
      throw new ApiError(response.status, message, errors);
    }

    if (response.status === 204) return null;
    
    return response.json();
  },

  get(endpoint: string) {
    return this.fetch(endpoint, { method: 'GET' });
  },

  post(endpoint: string, body?: any) {
    return this.fetch(endpoint, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
  },

  patch(endpoint: string, body?: any) {
    return this.fetch(endpoint, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });
  },

  delete(endpoint: string) {
    return this.fetch(endpoint, { method: 'DELETE' });
  }
};
