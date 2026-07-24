import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShieldCheck, XCircle } from '@/components/sgf/icons';

/**
 * Página pública de convite (rota /convite).
 *
 * Existe porque WhatsApp e SMS só transformam em link clicável URLs http(s):
 * um `sgffrota://` enviado direto chega ao motorista como texto morto. Aqui o
 * link é https (clicável em qualquer lugar) e o redirecionamento para o app
 * acontece no celular dele.
 *
 * A página é apenas um encaminhador: NÃO valida nem consome o token — quem faz
 * isso é a edge function `driver-registration`. O token só é repassado adiante.
 */

const APP_SCHEME = 'sgffrota://solicitar-cadastro';
const STORE_IOS = 'https://apps.apple.com/br/app/sgf-frota/id0000000000';
const STORE_ANDROID = 'https://play.google.com/store/apps/details?id=com.sgf.frota';

/** Tempo até assumir que o app não abriu e oferecer as lojas. */
const FALLBACK_MS = 1500;

export default function Convite() {
    const [params] = useSearchParams();
    const token = params.get('token')?.trim() ?? '';
    const [showStores, setShowStores] = useState(false);

    useEffect(() => {
        if (!token) return;

        window.location.href = `${APP_SCHEME}?token=${encodeURIComponent(token)}`;

        // As lojas aparecem sempre depois do timeout, sem checar visibilidade.
        // Suprimir quando a aba está oculta parece esperto, mas cria um beco sem
        // saída: o navegador interno do WhatsApp costuma carregar a página em
        // segundo plano, e aí o motorista ficaria preso em "Abrindo…" para
        // sempre. Se o app abriu, ele nem vê esta tela.
        const timer = window.setTimeout(() => setShowStores(true), FALLBACK_MS);
        return () => window.clearTimeout(timer);
    }, [token]);

    if (!token) {
        return (
            <Shell>
                <XCircle className="h-12 w-12 text-red-400" />
                <h1 className="mt-4 text-xl font-bold">Convite inválido</h1>
                <p className="mt-2 max-w-sm text-sm text-slate-300">
                    Este link está incompleto. Peça um novo convite ao gestor da sua secretaria.
                </p>
            </Shell>
        );
    }

    return (
        <Shell>
            <ShieldCheck className="h-12 w-12 text-emerald-300" />
            <h1 className="mt-4 text-xl font-bold">Abrindo o aplicativo…</h1>
            <p className="mt-2 max-w-sm text-sm text-slate-300">
                Se nada acontecer em alguns segundos, instale o aplicativo e toque no link novamente.
            </p>

            {showStores && (
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <a
                        href={STORE_ANDROID}
                        className="rounded-full bg-[#00A86B] px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110"
                    >
                        Baixar para Android
                    </a>
                    <a
                        href={STORE_IOS}
                        className="rounded-full border border-white/25 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                    >
                        Baixar para iPhone
                    </a>
                </div>
            )}
        </Shell>
    );
}

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#0F2B2F] px-6 text-center text-white">
            {children}
        </div>
    );
}
