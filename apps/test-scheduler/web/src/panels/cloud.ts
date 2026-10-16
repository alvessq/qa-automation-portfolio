import type { Catalog, CloudJob, CloudRun } from '../types';

export const WORKFLOW = 'mobile-e2e.yml';

export type CloudTest = { target: string; title: string; inputs: { suite: string; specName?: string } };

/** O que dá para rodar na nuvem: as duas suítes e cada spec do mobile. */
export function cloudTests(catalog?: Catalog): CloudTest[] {
  return [
    { target: 'smoke', title: 'Smoke', inputs: { suite: 'smoke' } },
    { target: 'regression', title: 'Regressão', inputs: { suite: 'regression' } },
    ...(catalog?.specs ?? []).map((spec) => ({ target: `spec:${spec.id}`, title: spec.name, inputs: { suite: 'spec', specName: spec.id } })),
  ];
}

export const targetOfInputs = (inputs: CloudJob['inputs']) => (inputs.suite === 'spec' ? `spec:${inputs.specName}` : inputs.suite ?? '');

export const runStatus = (run: CloudRun) => (run.status === 'completed' ? run.conclusion ?? 'completed' : run.status);
export const runActive = (run: CloudRun) => run.status !== 'completed';
