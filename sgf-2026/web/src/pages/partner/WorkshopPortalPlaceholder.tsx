import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import { SGFButton } from '@/components/sgf';
import { LogOut, Wrench } from '@/components/sgf/icons';

/**
 * A autenticação de oficina já existe desde a fase 4, mas o fluxo operacional
 * pertence à fase 7. Esta tela evita loop de redirecionamento para acessos já
 * criados sem fingir que o portal está pronto.
 */
export default function WorkshopPortalPlaceholder() {
    const { logout } = useAuth();
    const { branding } = useBranding();

    return (
        <div className="grid min-h-screen place-items-center bg-[#F5F7F9] p-6">
            <div className="w-full max-w-lg rounded-[2rem] bg-white p-8 text-center shadow-xl sm:p-10">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-blue-50 text-blue-700">
                    <Wrench className="h-8 w-8" />
                </div>
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-blue-700">{branding.name}</p>
                <h1 className="mt-2 text-2xl font-black text-slate-950">Sistema de Manutenção</h1>
                <p className="mt-3 text-sm leading-6 text-slate-500">
                    Seu acesso está ativo. O portal operacional da oficina será liberado na próxima etapa do projeto.
                </p>
                <SGFButton className="mt-6" variant="ghost" icon={LogOut} onClick={() => void logout()}>
                    Sair
                </SGFButton>
            </div>
        </div>
    );
}
