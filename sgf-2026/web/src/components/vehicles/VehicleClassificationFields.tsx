import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SGFSelect } from '@/components/sgf/SGFSelect';
import { costCentersApi, OWNERSHIP_OPTIONS, type VehicleOwnership } from '@/lib/fleet-api';

interface VehicleClassificationFieldsProps {
    ownership: VehicleOwnership;
    costCenterId: string;
    onOwnershipChange: (value: VehicleOwnership) => void;
    onCostCenterChange: (value: string) => void;
}

/** Vínculo (próprio/locado/cedido/comodato) e centro de custo do veículo. */
export function VehicleClassificationFields({
    ownership,
    costCenterId,
    onOwnershipChange,
    onCostCenterChange,
}: VehicleClassificationFieldsProps) {
    const { data: costCenters = [], isLoading } = useQuery({
        queryKey: ['cost-centers'],
        queryFn: () => costCentersApi.getAll(),
    });

    // Inativos só aparecem se já estiverem vinculados ao veículo.
    const options = useMemo(
        () => [
            { value: '', label: 'Sem centro de custo' },
            ...costCenters
                .filter((c) => c.active || c.id === costCenterId)
                .map((c) => ({ value: c.id, label: `${c.code} · ${c.name}${c.active ? '' : ' (inativo)'}` })),
        ],
        [costCenters, costCenterId],
    );

    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SGFSelect
                label="Vínculo"
                options={OWNERSHIP_OPTIONS}
                value={ownership}
                onChange={(val) => onOwnershipChange(val as VehicleOwnership)}
                fullWidth
            />
            <SGFSelect
                label="Centro de custo"
                options={options}
                value={costCenterId}
                onChange={onCostCenterChange}
                placeholder={isLoading ? 'Carregando...' : 'Sem centro de custo'}
                fullWidth
            />
        </div>
    );
}
