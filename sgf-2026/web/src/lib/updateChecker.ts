import { toast } from 'sonner';

const CHECK_EVERY_MS = 5 * 60_000;
const ENTRY = /\/assets\/index-[\w-]+\.js/;

/** Arquivo principal que esta aba carregou (muda a cada publicação). */
function loadedEntry(): string | null {
    for (const s of Array.from(document.scripts)) {
        const m = s.src.match(ENTRY);
        if (m) return m[0];
    }
    return null;
}

/**
 * O painel costuma ficar aberto o dia inteiro e, sendo SPA, nunca recarrega
 * sozinho: quem estava com a aba aberta continuava na versão antiga depois
 * das publicações. Aqui a página é conferida a cada 5 min (e ao voltar para a
 * aba); se o arquivo principal mudou, aparece um aviso para atualizar.
 */
export function startUpdateChecker(): void {
    const current = loadedEntry();
    if (!current) return;
    let notified = false;

    const check = async () => {
        if (notified || document.visibilityState !== 'visible') return;
        try {
            const html = await fetch('/', { cache: 'no-store' }).then((r) => (r.ok ? r.text() : ''));
            const live = html.match(ENTRY)?.[0];
            if (!live || live === current) return;
            notified = true;
            toast('Nova versão do sistema disponível', {
                description: 'Atualize para ver as últimas melhorias.',
                duration: Infinity,
                action: { label: 'Atualizar', onClick: () => window.location.reload() },
            });
        } catch {
            // sem rede: tenta de novo no próximo ciclo
        }
    };

    window.setInterval(() => void check(), CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', () => void check());
}
