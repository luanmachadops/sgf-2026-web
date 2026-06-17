import { TrackersPanel } from '@/components/TrackersPanel';

export default function Trackers() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Rastreadores</h1>
        <p className="text-sm text-slate-500">Cadastro e gestão dos rastreadores (SL48-4G) por prefeitura.</p>
      </div>
      <TrackersPanel />
    </div>
  );
}
