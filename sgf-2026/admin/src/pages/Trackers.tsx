import { TrackersPanel } from '@/components/TrackersPanel';
import { PageHeader } from '@/components/sgf';

export default function Trackers() {
  return (
    <div className="space-y-6">
      <PageHeader title="Rastreadores" subtitle="Cadastro dos rastreadores de cada prefeitura e vínculo com os veículos." />
      <TrackersPanel />
    </div>
  );
}
