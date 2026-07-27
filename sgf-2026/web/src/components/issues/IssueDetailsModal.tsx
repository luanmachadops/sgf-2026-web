import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { PhotoViewer } from '@/components/ui/PhotoViewer';
import { SGFBadge } from '@/components/sgf/SGFBadge';
import { AlertTriangle, Calendar, Car, Route, User } from '@/components/sgf/icons';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';
import type { Tables } from '@/types/database.types';

interface IssueDetailsModalProps {
    issueId: string | null;
    onClose: () => void;
}

type IssueDetails = Tables<'issues'> & {
    vehicle: { plate: string; brand: string | null; model: string | null } | null;
    driver: { full_name: string } | null;
    trip: { id: string; destination: string | null; start_at: string } | null;
};

const SEVERITY_LABEL = {
    baixa: 'Baixa',
    media: 'Média',
    alta: 'Alta',
} as const;

const STATUS_LABEL = {
    aberto: 'Aberto',
    em_analise: 'Em análise',
    resolvido: 'Resolvido',
} as const;

export function IssueDetailsModal({ issueId, onClose }: IssueDetailsModalProps) {
    const [photoIndex, setPhotoIndex] = useState<number | null>(null);
    const { data: issue, isLoading, isError } = useQuery({
        queryKey: ['issue', issueId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('issues')
                .select(`
                    *,
                    vehicle:vehicles!issues_vehicle_id_fkey(plate, brand, model),
                    driver:profiles!issues_driver_id_fkey(full_name),
                    trip:trips!issues_trip_id_fkey(id, destination, start_at)
                `)
                .eq('id', issueId!)
                .single();

            if (error) throw error;
            return data as unknown as IssueDetails;
        },
        enabled: Boolean(issueId),
    });

    const photos = issue?.photo_urls ?? [];
    const severityVariant = issue?.severity === 'alta'
        ? 'error'
        : issue?.severity === 'media'
            ? 'warning'
            : 'default';
    const statusVariant = issue?.status === 'resolvido'
        ? 'success'
        : issue?.status === 'em_analise'
            ? 'info'
            : 'warning';

    return (
        <>
            <Modal isOpen={Boolean(issueId)} onClose={onClose} title="Defeito reportado" size="lg">
                {isLoading ? (
                    <p className="py-10 text-center text-sm text-slate-400">Carregando o relato…</p>
                ) : isError || !issue ? (
                    <div className="py-10 text-center">
                        <AlertTriangle className="mx-auto h-9 w-9 text-amber-500" />
                        <p className="mt-3 font-bold text-slate-800">Relato não encontrado</p>
                        <p className="mt-1 text-sm text-slate-500">
                            O registro pode ter sido removido ou você não possui acesso a ele.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                    Relato {issue.id.slice(0, 8).toUpperCase()}
                                </p>
                                <h3 className="mt-1 text-lg font-black text-slate-900">{issue.title}</h3>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <SGFBadge variant={severityVariant}>
                                    Prioridade {SEVERITY_LABEL[issue.severity]}
                                </SGFBadge>
                                <SGFBadge variant={statusVariant}>{STATUS_LABEL[issue.status]}</SGFBadge>
                            </div>
                        </div>

                        {issue.description && (
                            <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
                                <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Descrição informada</p>
                                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{issue.description}</p>
                            </div>
                        )}

                        <dl className="grid gap-3 sm:grid-cols-2">
                            {[
                                {
                                    icon: Car,
                                    label: 'Veículo',
                                    value: issue.vehicle
                                        ? `${issue.vehicle.brand ?? ''} ${issue.vehicle.model ?? ''} · ${issue.vehicle.plate}`.trim()
                                        : 'Não vinculado',
                                },
                                {
                                    icon: User,
                                    label: 'Motorista',
                                    value: issue.driver?.full_name ?? 'Não informado',
                                },
                                {
                                    icon: Route,
                                    label: 'Viagem relacionada',
                                    value: issue.trip?.destination ?? 'Sem viagem vinculada',
                                },
                                {
                                    icon: Calendar,
                                    label: 'Data do relato',
                                    value: formatDate(issue.created_at),
                                },
                            ].map((item) => {
                                const Icon = item.icon;
                                return (
                                    <div key={item.label} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4">
                                        <div className="rounded-xl bg-white p-2 text-slate-500 shadow-sm">
                                            <Icon className="h-4 w-4" />
                                        </div>
                                        <div className="min-w-0">
                                            <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{item.label}</dt>
                                            <dd className="truncate text-sm font-semibold text-slate-800">{item.value}</dd>
                                        </div>
                                    </div>
                                );
                            })}
                        </dl>

                        <div>
                            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                                Evidências ({photos.length})
                            </p>
                            {photos.length === 0 ? (
                                <p className="rounded-2xl border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400">
                                    Nenhuma foto foi anexada ao relato.
                                </p>
                            ) : (
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                    {photos.map((photo, index) => (
                                        <button
                                            key={photo}
                                            type="button"
                                            aria-label={`Abrir evidência ${index + 1}`}
                                            onClick={() => setPhotoIndex(index)}
                                            className="aspect-video overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
                                        >
                                            <img
                                                src={photo}
                                                alt={`Evidência ${index + 1} do defeito`}
                                                className="h-full w-full object-cover transition-transform hover:scale-105"
                                            />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </Modal>
            <PhotoViewer
                images={photoIndex == null ? undefined : photos}
                startIndex={photoIndex ?? 0}
                onClose={() => setPhotoIndex(null)}
            />
        </>
    );
}
