# Fluxo fiscal dos postos

## Regra adotada

O sistema não trata o fechamento mensal como autorização retroativa da
despesa. Antes de liberar abastecimentos, ARLA, lubrificantes ou serviços, deve
existir NAD/nota de empenho previamente emitida, vigente e com saldo.

Sequência controlada:

1. contrato/licitação vigente e dotação definida;
2. NAD e empenho prévio, ordinário, estimativo ou global conforme a orientação
   da contabilidade municipal;
3. autorização digital do fornecimento, limitada pelo contrato e pelo empenho;
4. execução com protocolo, veículo, motorista, secretaria, autorizador,
   hodômetro, quantidade, preço, comprovante e evidência;
5. validação dos registros pela gestão;
6. fechamento mensal imutável, com protocolo e hash SHA-256;
7. conferência e vínculo ao empenho que já cobria o fornecimento;
8. emissão e anexação da nota fiscal;
9. recebimento/ateste e liquidação;
10. programação e confirmação do pagamento, preservando a ordem cronológica.

## Base normativa

- [Lei 4.320/1964, arts. 58 a 64](https://www.planalto.gov.br/ccivil_03/leis/l4320compilado.htm):
  veda despesa sem prévio empenho e exige contrato, nota de empenho e
  comprovantes de entrega/prestação para a liquidação.
- [Lei 14.133/2021, arts. 92, 140 e 141](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm):
  disciplina condições de medição/pagamento, recebimento do objeto e ordem
  cronológica dos pagamentos.

## Validação institucional

O tipo de empenho, a fonte de recursos, a classificação orçamentária, os
responsáveis pelo recebimento/ateste e os prazos devem ser parametrizados e
homologados pela contabilidade, controle interno e assessoria jurídica de cada
município. O sistema aplica a ordem mínima de controle, mas não substitui o
regulamento municipal.
