/**
 * SGF 2026 — API Client
 * Wrapper de fetch com JWT, interceptors e error handling.
 * Consome o backend NestJS (não Supabase direto).
 */

function normalizeApiUrl(url: string): string {
  const withoutTrailingSlash = url.replace(/\/$/, '');
  return withoutTrailingSlash.endsWith('/api')
    ? withoutTrailingSlash
    : `${withoutTrailingSlash}/api`;
}

function resolveApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured) {
    return normalizeApiUrl(configured);
  }

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:3000/api';
    }
  }

  return '/api';
}

const API_BASE_URL = resolveApiBaseUrl();

interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem('sgf_token');
  }

  setToken(token: string): void {
    sessionStorage.setItem('sgf_token', token);
  }

  clearToken(): void {
    sessionStorage.removeItem('sgf_token');
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const token = this.getToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Remove Content-Type for FormData (browser sets it with boundary)
    if (options.body instanceof FormData) {
      delete headers['Content-Type'];
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    // Handle 401 - redirect to login
    if (response.status === 401) {
      this.clearToken();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    if (!response.ok) {
      const errorData: ApiError = await response.json().catch(() => ({
        statusCode: response.status,
        message: 'Erro de conexão com o servidor',
      }));
      throw new Error(errorData.message || `Erro ${response.status}`);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async patch<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  async upload<T>(endpoint: string, file: File, fieldName = 'file'): Promise<T> {
    const formData = new FormData();
    formData.append(fieldName, file);

    return this.request<T>(endpoint, {
      method: 'POST',
      body: formData,
    });
  }
}

export const api = new ApiClient(API_BASE_URL);
