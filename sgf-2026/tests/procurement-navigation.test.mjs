import { test } from 'node:test';
import assert from 'node:assert/strict';
import { procurementAccess } from '../web/src/lib/procurement-navigation.ts';

test('central não oferece acesso a visitantes, motoristas ou parceiros', () => {
  for (const user of [null, undefined, {}, ...['posto', 'oficina', 'motorista'].map(accountRole => ({ accountRole }))]) {
    assert.deepEqual(procurementAccess(user), { overview: false, budgets: false, entry: null });
  }
});

test('secretaria mantém acesso às próprias cotas sem abrir contratos globais', () => {
  for (const departmentScopeId of ['saude', undefined]) {
    assert.deepEqual(procurementAccess({ accountRole: 'secretario', departmentScopeId, allowedModules: ['budgets', 'reports', 'stations', 'repair_shops'] }),
      { overview: false, budgets: true, entry: '/licitacoes/limites' });
  }
});

test('não amplia permissão de leitor autorizado somente a um tipo de fornecedor', () => {
  for (const allowedModules of [[], ['stations'], ['repair_shops']]) {
    assert.equal(procurementAccess({ accountRole: 'gestor', allowedModules }).entry, null);
  }
  assert.deepEqual(procurementAccess({ accountRole: 'gestor', allowedModules: ['stations', 'budgets'] }),
    { overview: false, budgets: true, entry: '/licitacoes/limites' });
});

test('leitores globais existentes consultam contratos sem ganhar permissão de cotas', () => {
  for (const allowedModules of [['reports'], ['stations', 'repair_shops']]) {
    assert.deepEqual(procurementAccess({ accountRole: 'gestor', allowedModules }),
      { overview: true, budgets: false, entry: '/licitacoes' });
  }
  assert.equal(procurementAccess({ accountRole: 'gestor', departmentScopeId: 'saude', allowedModules: ['reports'] }).overview, false);
});

test('administrador com módulos explícitos vazios não recebe acesso implícito', () => {
  assert.equal(procurementAccess({ accountRole: 'admin', allowedModules: [] }).entry, null);
  assert.deepEqual(procurementAccess({ accountRole: 'admin' }),
    { overview: true, budgets: true, entry: '/licitacoes' });
});
