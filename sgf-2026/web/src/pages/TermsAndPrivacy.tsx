import { Link } from 'react-router-dom';
import { ShieldCheck } from '@/components/sgf/icons';

const UPDATED_AT = '29 de julho de 2026';

export default function TermsAndPrivacy() {
    return (
        <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:py-12">
            <article className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
                <div className="flex items-center gap-3">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
                        <ShieldCheck className="h-6 w-6" />
                    </div>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Exattus Rotta</p>
                        <h1 className="text-2xl font-bold text-slate-950">Termos de uso e privacidade</h1>
                    </div>
                </div>
                <p className="mt-4 text-sm text-slate-500">Última atualização: {UPDATED_AT}</p>

                <div className="mt-8 space-y-8 text-sm leading-7 text-slate-600">
                    <section>
                        <h2 className="text-lg font-bold text-slate-900">1. Finalidade do aplicativo</h2>
                        <p className="mt-2">
                            O Exattus Rotta apoia a gestão da frota municipal. O acesso do motorista permite
                            identificação, registro de viagens, checklists, localização durante atividades,
                            abastecimentos, manutenções, documentos e comunicação operacional.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-lg font-bold text-slate-900">2. Responsabilidades do usuário</h2>
                        <p className="mt-2">
                            O usuário deve informar dados verdadeiros, manter sua senha em sigilo, utilizar o
                            aplicativo apenas para fins profissionais autorizados e comunicar qualquer uso
                            indevido, perda de acesso ou inconsistência ao gestor responsável.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-lg font-bold text-slate-900">3. Dados pessoais tratados</h2>
                        <p className="mt-2">
                            Conforme a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018), podem ser
                            tratados dados de identificação e contato, CPF, matrícula, CNH, fotografia,
                            vínculo com secretaria, registros de uso, localização vinculada às viagens,
                            ocorrências, abastecimentos e demais informações necessárias à operação da frota.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-lg font-bold text-slate-900">4. Como e por que os dados são usados</h2>
                        <p className="mt-2">
                            Os dados são usados para validar o vínculo do motorista, proteger o acesso,
                            executar atividades de interesse público e obrigações administrativas, garantir
                            segurança operacional, produzir auditoria e relatórios e atender solicitações
                            legítimas da prefeitura. O tratamento deve observar finalidade, necessidade,
                            transparência, segurança e prevenção.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-lg font-bold text-slate-900">5. Compartilhamento e conservação</h2>
                        <p className="mt-2">
                            O acesso é limitado a pessoas autorizadas e prestadores indispensáveis à operação
                            tecnológica, sujeitos a controles de segurança. Os dados são conservados pelo
                            período necessário às finalidades administrativas, legais, de auditoria e
                            prestação de contas, e depois eliminados ou anonimizados quando aplicável.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-lg font-bold text-slate-900">6. Direitos do titular</h2>
                        <p className="mt-2">
                            O titular pode solicitar confirmação e acesso aos dados, correção de informações
                            incompletas ou incorretas e esclarecimentos sobre o tratamento. Outros direitos
                            previstos na LGPD serão analisados conforme a base legal e as obrigações da
                            administração pública. As solicitações devem ser encaminhadas ao gestor ou canal
                            de suporte informado pela prefeitura.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-lg font-bold text-slate-900">7. Segurança e alterações</h2>
                        <p className="mt-2">
                            São adotadas medidas técnicas e administrativas para reduzir riscos de acesso não
                            autorizado, perda e uso indevido. Estes termos podem ser atualizados para refletir
                            mudanças legais ou funcionais; quando necessário, um novo aceite será solicitado.
                        </p>
                    </section>
                </div>

                <div className="mt-10 flex flex-wrap gap-3 border-t border-slate-100 pt-6">
                    <button type="button" onClick={() => window.close()} className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">
                        Fechar
                    </button>
                    <Link to="/login" className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">
                        Ir para o login
                    </Link>
                </div>
            </article>
        </main>
    );
}
