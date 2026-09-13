import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authErrorMessage } from '../web/src/lib/authErrors.ts';

const UNSTABLE = 'O serviço de autenticação está instável no momento. Tente novamente em alguns instantes.';

test('authErrorMessage: credenciais inválidas', () => {
  const err = Object.assign(new Error('Invalid login credentials'), { code: 'invalid_credentials', status: 400 });
  assert.equal(authErrorMessage(err), 'E-mail ou senha incorretos.');
});

test('authErrorMessage: 504 (request_timeout) com mensagem stringificada "{}"', () => {
  const err = Object.assign(new Error('{}'), { name: 'AuthRetryableFetchError', status: 504 });
  assert.equal(authErrorMessage(err), UNSTABLE);
});

test('authErrorMessage: 503 com mensagem vazia', () => {
  const err = Object.assign(new Error(''), { name: 'AuthRetryableFetchError', status: 503 });
  assert.equal(authErrorMessage(err), UNSTABLE);
});

test('authErrorMessage: status 5xx sem AuthRetryableFetchError', () => {
  const err = Object.assign(new Error('Internal Server Error'), { status: 500 });
  assert.equal(authErrorMessage(err), UNSTABLE);
});

test('authErrorMessage: erro de rede (TypeError)', () => {
  const err = new TypeError('Failed to fetch');
  assert.equal(authErrorMessage(err), UNSTABLE);
});

test('authErrorMessage: rate limit 429', () => {
  const err = Object.assign(new Error('Too many requests'), { status: 429 });
  assert.equal(authErrorMessage(err), 'Muitas tentativas. Aguarde um pouco e tente novamente.');
});

test('authErrorMessage: rate limit via código over_request_rate_limit', () => {
  const err = Object.assign(new Error('rate limited'), { code: 'over_request_rate_limit' });
  assert.equal(authErrorMessage(err), 'Muitas tentativas. Aguarde um pouco e tente novamente.');
});

test('authErrorMessage: mensagem legível é preservada', () => {
  const err = new Error('Algum erro específico e legível.');
  assert.equal(authErrorMessage(err), 'Algum erro específico e legível.');
});

test('authErrorMessage: erro desconhecido sem mensagem cai no texto de instabilidade', () => {
  assert.equal(authErrorMessage({}), UNSTABLE);
  assert.equal(authErrorMessage(undefined), UNSTABLE);
});

test('authErrorMessage: nunca renderiza um objeto cru', () => {
  const result = authErrorMessage({ foo: 'bar' });
  assert.notEqual(result, '[object Object]');
  assert.equal(typeof result, 'string');
  assert.ok(result.length > 0);
});
