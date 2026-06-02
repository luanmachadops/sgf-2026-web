"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getStoredDriver, driverLogout, isDriverAuthenticated, type Driver } from "@/lib/auth";

export default function HomePage() {
  const router = useRouter();
  const driver: Driver | null = getStoredDriver();

  useEffect(() => {
    if (!isDriverAuthenticated() || !driver) {
      router.replace("/login");
    }
  }, [router, driver]);

  if (!driver) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="spinner" />
      </div>
    );
  }

  const menuItems = [
    {
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2"/><rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2"/><rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2"/><rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2"/></svg>
      ),
      label: "Escanear QR",
      description: "Identificar veículo",
      href: "/scanner",
      color: "var(--color-primary-green)",
      bgColor: "rgba(0, 168, 107, 0.1)",
    },
    {
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5H6.5C5.84 5 5.29 5.42 5.08 6.01L3 12V20C3 20.55 3.45 21 4 21H5C5.55 21 6 20.55 6 20V19H18V20C18 20.55 18.45 21 19 21H20C20.55 21 21 20.55 21 20V12L18.92 6.01Z" stroke="currentColor" strokeWidth="1.8" fill="none"/><circle cx="7.5" cy="14.5" r="1.5" fill="currentColor"/><circle cx="16.5" cy="14.5" r="1.5" fill="currentColor"/></svg>
      ),
      label: "Nova Viagem",
      description: "Iniciar uma corrida",
      href: "/trip/start",
      color: "#3B82F6",
      bgColor: "rgba(59, 130, 246, 0.1)",
    },
    {
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M19.77 7.23L19.78 7.22C20.07 6.98 20.06 6.55 19.76 6.32L16.56 3.96C16.22 3.7 15.74 3.89 15.64 4.3L15.12 6.5H8.88L8.36 4.3C8.26 3.89 7.78 3.7 7.44 3.96L4.24 6.32C3.94 6.55 3.93 6.98 4.22 7.22L4.23 7.23L6 8.5V16.5L4.23 17.77C3.93 18.01 3.94 18.44 4.24 18.67L7.44 21.04C7.78 21.3 8.26 21.11 8.36 20.7L8.88 18.5H15.12L15.64 20.7C15.74 21.11 16.22 21.3 16.56 21.04L19.76 18.67C20.06 18.44 20.07 18.01 19.78 17.78L19.77 17.77L18 16.5V8.5L19.77 7.23Z" stroke="currentColor" strokeWidth="1.8" fill="none"/><line x1="12" y1="8" x2="12" y2="16" stroke="currentColor" strokeWidth="1.8"/></svg>
      ),
      label: "Abastecimento",
      description: "Registrar combustível",
      href: "/refueling",
      color: "#F59E0B",
      bgColor: "rgba(245, 158, 11, 0.1)",
    },
    {
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M22 12C22 17.52 17.52 22 12 22C6.48 22 2 17.52 2 12C2 6.48 6.48 2 12 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M12 6V12L16 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M17 3H21V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
      ),
      label: "Histórico",
      description: "Viagens anteriores",
      href: "/trip/history",
      color: "#8B5CF6",
      bgColor: "rgba(139, 92, 246, 0.1)",
    },
    {
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M22 11.08V12C21.9988 14.1564 21.3005 16.2547 20.0093 17.9818C18.7182 19.709 16.9033 20.9725 14.8354 21.5839C12.7674 22.1953 10.5573 22.1219 8.53447 21.3746C6.51168 20.6273 4.78465 19.2461 3.61096 17.4371C2.43727 15.628 1.87979 13.4881 2.02168 11.3363C2.16356 9.18457 2.99721 7.13633 4.39828 5.49707C5.79935 3.85782 7.69279 2.71538 9.79619 2.24015C11.8996 1.76491 14.1003 1.98234 16.07 2.86" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M22 4L12 14.01L9 11.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
      ),
      label: "Manutenção",
      description: "Solicitar reparo",
      href: "/maintenance",
      color: "#EF4444",
      bgColor: "rgba(239, 68, 68, 0.1)",
    },
    {
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12Z" stroke="currentColor" strokeWidth="1.8"/><path d="M12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" stroke="currentColor" strokeWidth="1.8"/></svg>
      ),
      label: "Meu Perfil",
      description: "Dados e score",
      href: "/profile",
      color: "#6366F1",
      bgColor: "rgba(99, 102, 241, 0.1)",
    },
  ];

  return (
    <div className="min-h-dvh flex flex-col bg-[var(--color-surface)]">
      {/* Header */}
      <header className="bg-[var(--color-primary-dark)] text-white px-5 pt-14 pb-8 rounded-b-[24px]">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-sm text-[var(--color-primary-green-light)] font-medium">
              Bom {getGreeting()},
            </p>
            <h1 className="text-xl font-bold mt-0.5">
              {driver.name.split(" ")[0]}
            </h1>
          </div>
          <button
            onClick={driverLogout}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            title="Sair"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M10 9V5L3 12L10 19V15H21V9H10Z" fill="white" opacity="0.8"/></svg>
          </button>
        </div>

        {/* Score Card */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-[var(--color-primary-green)] flex items-center justify-center text-white font-bold text-xl">
            {driver.score}
          </div>
          <div>
            <p className="text-sm text-white/70">Seu Score</p>
            <p className="text-base font-semibold">
              {driver.score >= 80 ? "Excelente" : driver.score >= 60 ? "Bom" : "Precisa melhorar"}
            </p>
          </div>
          <div className="ml-auto">
            <div className="badge badge-success text-xs">
              {driver.status === "ACTIVE" ? "Ativo" : driver.status}
            </div>
          </div>
        </div>
      </header>

      {/* Menu Grid */}
      <main className="flex-1 px-5 py-6 page-enter">
        <p className="text-sm font-semibold text-[var(--color-text-secondary)] mb-4 uppercase tracking-wide">
          Ações rápidas
        </p>
        <div className="grid grid-cols-2 gap-3">
          {menuItems.map((item) => (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className="card text-left hover:shadow-lg transition-all duration-200 active:scale-[0.97] p-4"
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
                style={{ background: item.bgColor, color: item.color }}
              >
                {item.icon}
              </div>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                {item.label}
              </p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {item.description}
              </p>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "dia";
  if (hour < 18) return "tarde";
  return "noite";
}
