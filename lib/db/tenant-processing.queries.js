const COLUMN_MAP = {
  blocked_numbers: {
    flag: "blocked_numbers_processing",
    startedAt: "blocked_numbers_started_at",
  },
  report: {
    flag: "report_processing",
    startedAt: "report_started_at",
  },
};

function columnsFor(type) {
  const columns = COLUMN_MAP[type];
  if (!columns) {
    throw new Error(`Tipo de processamento desconhecido: ${type}`);
  }
  return columns;
}

/**
 * Espelho do TenantProcessingService::finish() do Laravel.
 * Limpa a flag de processamento do tenant — chamado pela Lambda
 * em sucesso e em erro para liberar novos disparos.
 */
function finish(db, { userId, type }) {
  const columns = columnsFor(type);
  return db("tenant_processing_statuses")
    .where("user_id", userId)
    .update({
      [columns.flag]: false,
      [columns.startedAt]: null,
    });
}

module.exports = { finish, columnsFor };
