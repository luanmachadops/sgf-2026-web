import { IopgpsPanel } from '@/components/IopgpsPanel';
import { PageHeader } from '@/components/sgf';

export default function Iopgps() {
  return (
    <div className="space-y-6">
      <PageHeader title="Monitoramento GPS" subtitle="Situação em tempo real dos rastreadores (IOPGPS), comandos remotos e sincronização." />
      <IopgpsPanel />
    </div>
  );
}
