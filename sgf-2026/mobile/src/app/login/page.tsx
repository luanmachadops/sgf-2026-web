"use client";

import { useState, type FormEvent, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { driverLogin } from "@/lib/auth";
import { formatCpf, isValidCpf, cleanCpf } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const [cpf, setCpf] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isFormValid = cleanCpf(cpf).length === 11 && password.length >= 6;

  function handleCpfChange(e: ChangeEvent<HTMLInputElement>) {
    const formatted = formatCpf(e.target.value);
    setCpf(formatted);
    setError("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!isValidCpf(cpf)) {
      setError("CPF inválido");
      return;
    }

    setLoading(true);
    try {
      await driverLogin({ cpf, password });
      router.replace("/home");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao fazer login";
      if (message.includes("locked") || message.includes("bloqueada")) {
        setError("Conta bloqueada após 3 tentativas. Contate o gestor.");
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-[var(--color-surface)]">
      {/* Header */}
      <div className="flex flex-col items-center pt-16 pb-8 px-6">
        <div className="w-20 h-20 rounded-2xl bg-[var(--color-primary-dark)] flex items-center justify-center mb-6 shadow-lg">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5H6.5C5.84 5 5.29 5.42 5.08 6.01L3 12V20C3 20.55 3.45 21 4 21H5C5.55 21 6 20.55 6 20V19H18V20C18 20.55 18.45 21 19 21H20C20.55 21 21 20.55 21 20V12L18.92 6.01Z" fill="var(--color-primary-green)"/>
            <circle cx="7.5" cy="14.5" r="1.5" fill="var(--color-text-inverse)"/>
            <circle cx="16.5" cy="14.5" r="1.5" fill="var(--color-text-inverse)"/>
            <path d="M5.5 9L6.5 6H17.5L18.5 9H5.5Z" fill="var(--color-primary-green-light)" opacity="0.5"/>
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-[var(--color-primary-dark)]">
          SGF 2026
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Portal do Motorista
        </p>
      </div>

      {/* Form */}
      <div className="flex-1 px-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* CPF */}
          <div>
            <label
              htmlFor="cpf"
              className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2"
            >
              CPF
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" fill="currentColor"/>
                </svg>
              </span>
              <input
                id="cpf"
                type="tel"
                inputMode="numeric"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={handleCpfChange}
                className="input-field pl-12"
                autoComplete="username"
                maxLength={14}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2"
            >
              Senha
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 8H17V6C17 3.24 14.76 1 12 1C9.24 1 7 3.24 7 6V8H6C4.9 8 4 8.9 4 10V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V10C20 8.9 19.1 8 18 8ZM12 17C10.9 17 10 16.1 10 15C10 13.9 10.9 13 12 13C13.1 13 14 13.9 14 15C14 16.1 13.1 17 12 17ZM15.1 8H8.9V6C8.9 4.29 10.29 2.9 12 2.9C13.71 2.9 15.1 4.29 15.1 6V8Z" fill="currentColor"/>
                </svg>
              </span>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Sua senha"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                className="input-field pl-12 pr-12"
                autoComplete="current-password"
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 7C14.76 7 17 9.24 17 12C17 12.65 16.87 13.26 16.64 13.83L19.56 16.75C21.07 15.49 22.26 13.86 22.99 12C21.26 7.61 16.99 4.5 11.99 4.5C10.59 4.5 9.25 4.75 8.01 5.2L10.17 7.36C10.74 7.13 11.35 7 12 7ZM2 4.27L4.28 6.55L4.74 7.01C3.08 8.3 1.78 10.02 1 12C2.73 16.39 7 19.5 12 19.5C13.55 19.5 15.03 19.2 16.38 18.66L16.81 19.08L19.73 22L21 20.73L3.27 3L2 4.27ZM7.53 9.8L9.08 11.35C9.03 11.56 9 11.78 9 12C9 13.66 10.34 15 12 15C12.22 15 12.44 14.97 12.65 14.92L14.2 16.47C13.53 16.8 12.79 17 12 17C9.24 17 7 14.76 7 12C7 11.21 7.2 10.47 7.53 9.8ZM11.84 9.02L14.99 12.17L15.01 12.01C15.01 10.35 13.67 9.01 12.01 9.01L11.84 9.02Z" fill="currentColor"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 4.5C7 4.5 2.73 7.61 1 12C2.73 16.39 7 19.5 12 19.5C17 19.5 21.27 16.39 23 12C21.27 7.61 17 4.5 12 4.5ZM12 17C9.24 17 7 14.76 7 12C7 9.24 9.24 7 12 7C14.76 7 17 9.24 17 12C17 14.76 14.76 17 12 17ZM12 9C10.34 9 9 10.34 9 12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12C15 10.34 13.66 9 12 9Z" fill="currentColor"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-[rgba(239,68,68,0.08)] text-[var(--color-danger)] text-sm font-medium animate-[fadeInUp_0.2s_ease-out]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z" fill="currentColor"/>
              </svg>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!isFormValid || loading}
            className="btn-primary mt-2"
          >
            {loading ? (
              <>
                <div className="spinner !w-5 !h-5 !border-white/30 !border-t-white" />
                Entrando...
              </>
            ) : (
              "Entrar"
            )}
          </button>
        </form>
      </div>

      {/* Footer */}
      <div className="py-6 text-center">
        <p className="text-xs text-[var(--color-text-muted)]">
          SGF 2026 — Sistema de Gestão de Frotas
        </p>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">
          Problemas com acesso? Contate o gestor da frota.
        </p>
      </div>
    </div>
  );
}
