const knex = require("../lib/db/knex");
const blockedNumbersQ = require("../lib/db/blocked-numbers.queries");
const raffleNumbersQ = require("../lib/db/raffle-numbers.queries");
const notificationsQ = require("../lib/db/notifications.queries");

const CHUNK_SIZE = 5000;
const MAX_ITERATIONS_SLACK = 10;

async function processChunk(trx, { uniqueName, raffleId }) {
  const numbers = await blockedNumbersQ.fetchUnclaimedChunk(trx, {
    raffleId,
    limit: CHUNK_SIZE,
  });
  if (!numbers.length) return 0;

  await raffleNumbersQ.unlockNumbers(trx, { uniqueName, raffleId, numbers });

  return blockedNumbersQ.deleteUnclaimedByNumbers(trx, { raffleId, numbers });
}

/**
 * Espelha App\Jobs\DeleteBlockedNumbersJob::handle():
 * - notifica inicio
 * - loop em chunks ate esvaziar
 * - notifica fim (sucesso) — erro vira no catch do handler
 *
 * Mantemos as notificacoes sem user_id por paridade com o codigo PHP atual.
 */
async function execute({ database, userId, uniqueName, raffleId }) {
  const startedAt = Date.now();
  const db = await knex.connect(database);

  try {
    await notificationsQ.insert(db, {
      type: "info",
      title: "Exclusão dos numeros bloqueados iniciada",
      message: "A exclusão dos números bloqueados foi iniciada",
      userId: null,
    });

    const initialCount = await blockedNumbersQ.countUnclaimed(db, { raffleId });
    const maxIterations =
      Math.ceil(initialCount / CHUNK_SIZE) + MAX_ITERATIONS_SLACK;

    let iterations = 0;
    let totalDeleted = 0;

    while (true) {
      if (++iterations > maxIterations) {
        throw new Error(
          `delete-blocked-numbers: limite de iteracoes (${maxIterations}) excedido para raffle ${raffleId}`
        );
      }

      const processed = await db.transaction((trx) =>
        processChunk(trx, { uniqueName, raffleId })
      );

      if (!processed) break;
      totalDeleted += processed;
    }

    await notificationsQ.insert(db, {
      type: "success",
      title: "Exclusão dos numeros bloqueados finalizada",
      message: "A exclusão dos números bloqueados foi finalizada com sucesso!",
      userId: null,
    });

    return {
      ok: true,
      raffleId,
      totalDeleted,
      iterations,
      elapsedMs: Date.now() - startedAt,
    };
  } finally {
    await db.destroy().catch(() => {});
  }
}

module.exports = { execute, processChunk, CHUNK_SIZE };
