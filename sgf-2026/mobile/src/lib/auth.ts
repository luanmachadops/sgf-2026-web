/**
 * SGF 2026 — Auth Service (Motorista)
 * Login por CPF + senha via backend NestJS.
 */

import { api } from './api';

export interface Driver {
  id: string;
  name: string;
  cpf: string;
  cnh_number: string;
  cnh_category: string;
  cnh_expiry: string;
  department: string;
  status: string;
  score: number;
  phone?: string;
}

export interface LoginResponse {
  access_token?: string;
  accessToken?: string;
  userId?: string;
  name?: string;
  driver?: Driver;
}

export interface LoginCredentials {
  cpf: string;
  password: string;
}

/**
 * Login do motorista via CPF + senha
 */
export async function driverLogin(credentials: LoginCredentials): Promise<LoginResponse> {
  // Remove máscara do CPF
  const cleanCpf = credentials.cpf.replace(/\D/g, '');

  const response = await api.post<LoginResponse>('/auth/driver/login', {
    cpf: cleanCpf,
    password: credentials.password,
  });

  const token = response.access_token || response.accessToken;
  if (!token) {
    throw new Error("Token de autenticação não retornado pela API.");
  }

  const driver: Driver = response.driver || {
    id: response.userId || cleanCpf,
    name: response.name || "Motorista",
    cpf: cleanCpf,
    cnh_number: "",
    cnh_category: "",
    cnh_expiry: "",
    department: "",
    status: "ACTIVE",
    score: 0,
  };

  // Salva o token
  api.setToken(token);

  // Salva dados do motorista
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('sgf_driver', JSON.stringify(driver));
  }

  return {
    ...response,
    access_token: token,
    driver,
  };
}

/**
 * Logout — limpa token e dados
 */
export function driverLogout(): void {
  api.clearToken();
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('sgf_driver');
    window.location.href = '/login';
  }
}

/**
 * Retorna dados do motorista logado (do sessionStorage)
 */
export function getStoredDriver(): Driver | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem('sgf_driver');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Verifica se está autenticado
 */
export function isDriverAuthenticated(): boolean {
  return api.isAuthenticated() && !!getStoredDriver();
}
