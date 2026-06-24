-- Renomeia etapas do funil padrão "Vendas Inside Sales" para o funil da jornada
UPDATE "Stage" s
SET "name" = v.new_name
FROM "Pipeline" p,
     (VALUES
       (0, 'Reunião agendada'),
       (1, 'Reagendamento'),
       (2, 'Follow-up'),
       (3, 'Venda')
     ) AS v(sort_order, new_name)
WHERE s."pipelineId" = p.id
  AND p."name" = 'Vendas Inside Sales'
  AND s."sortOrder" = v.sort_order;

-- Etapa extra legada (ex.: Fechado ganho) vira etapa de perda visual
UPDATE "Stage" s
SET "name" = 'Perdido', "lifecycle" = 'CLOSED'
FROM "Pipeline" p
WHERE s."pipelineId" = p.id
  AND p."name" = 'Vendas Inside Sales'
  AND s."sortOrder" >= 4
  AND s."name" NOT IN ('Perdido', 'Reunião agendada', 'Reagendamento', 'Follow-up', 'Venda');
