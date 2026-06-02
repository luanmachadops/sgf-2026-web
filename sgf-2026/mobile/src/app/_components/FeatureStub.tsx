import Link from "next/link";

type FeatureStubProps = {
  title: string;
  description: string;
};

export function FeatureStub({ title, description }: FeatureStubProps) {
  return (
    <div className="min-h-dvh bg-[var(--color-surface)] px-5 py-8">
      <div className="mx-auto max-w-md space-y-4">
        <Link href="/home" className="inline-flex text-sm font-semibold text-[var(--color-primary-green)]">
          Voltar
        </Link>
        <div className="card space-y-3">
          <h1 className="text-xl font-bold text-[var(--color-primary-dark)]">{title}</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">{description}</p>
          <p className="text-xs text-[var(--color-text-muted)]">
            Tela inicial implementada para evitar rota quebrada e permitir continuidade do fluxo.
          </p>
        </div>
      </div>
    </div>
  );
}
