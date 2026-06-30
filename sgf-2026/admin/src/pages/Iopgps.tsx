import { IopgpsPanel } from '@/components/IopgpsPanel';

export default function Iopgps() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Monitoramento GPS</h1>
        <p className="text-sm text-slate-500">Status em tempo real dos rastreadores (IOPGPS), comandos remotos e sincronização.</p>
      </div>
      <IopgpsPanel />
    </div>
  );
}
