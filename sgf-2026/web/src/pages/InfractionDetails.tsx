import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SGFButton } from '@/components/sgf/SGFButton';
import { SGFCard } from '@/components/sgf/SGFCard';
import { ArrowLeft, Loader2 } from '@/components/sgf/icons';
import { ManageInfractionModal } from '@/components/infractions/InfractionManager';
import { useHeader } from '@/contexts/HeaderContext';
import { useGoBack } from '@/hooks/useGoBack';
import { infractionsApi } from '@/lib/supabase-api';
import type { InfractionRow } from '@/lib/infractionFormat';

/** Página de uma infração: tudo para gerenciar, indicar o condutor e gerar o FICI. */
export default function InfractionDetails() {
    const { id = '' } = useParams<{ id: string }>();
    const { setTitle, setDescription, setHeaderAction } = useHeader();
    const goBack = useGoBack('/infracoes');

    const { data, isLoading, isError } = useQuery({
        queryKey: ['infractions', 'detail', id],
        queryFn: () => infractionsApi.getById(id),
        enabled: Boolean(id),
    });

    useEffect(() => {
        setTitle('Infração');
        setDescription('Dados da multa, local, condutor responsável, prazo e documentos.');
        setHeaderAction(
            <SGFButton variant="ghost" icon={ArrowLeft} onClick={goBack} className="!rounded-full">
                <span className="hidden md:inline">Voltar</span>
            </SGFButton>,
        );
        return () => setHeaderAction(null);
    }, [setTitle, setDescription, setHeaderAction, goBack]);

    if (isLoading) {
        return <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }
    if (isError || !data) {
        return <SGFCard padding="lg"><p className="text-sm font-medium text-rose-600">Infração não encontrada.</p></SGFCard>;
    }

    return (
        <div className="mx-auto w-full max-w-4xl">
            <ManageInfractionModal infraction={data as unknown as InfractionRow} onClose={goBack} layout="page" />
        </div>
    );
}
