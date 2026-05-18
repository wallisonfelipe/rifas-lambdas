const knex = require("../lib/db/knex");
const rafflesQ = require("../lib/db/raffles.queries");
const raffleNumbersQ = require("../lib/db/raffle-numbers.queries");
const blockedNumbersQ = require("../lib/db/blocked-numbers.queries");
const awardNumbersQ = require("../lib/db/award-numbers.queries");
const raffleCountersQ = require("../lib/db/raffle-counters.queries");
const notificationsQ = require("../lib/db/notifications.queries");
const tenantProcessingQ = require("../lib/db/tenant-processing.queries");

const CHUNK_SIZE = 5000;

function eligibleNumbersForChunk({ available, blocked, awards }) {
  if (!available.length) return [];
  const exclude = new Set([...blocked, ...awards]);
  return available.filter((n) => !exclude.has(n));
}

function buildBlockedRows({
  eligible,
  raffleId,
  userId,
  position,
  minValue,
  maxValue,
}) {
  const createdAt = new Date();
  return eligible.map((number) => ({
    number,
    position,
    raffle_id: raffleId,
    user_id: userId,
    locked: true,
    min_value: minValue ?? null,
    max_value: maxValue ?? null,
    created_at: createdAt,
  }));
}

async function processChunk(
  trx,
  { uniqueName, raffleId, userId, chunkStart, chunkEnd, position, minValue, maxValue }
) {
  const available = await raffleNumbersQ.fetchAvailableInRange(trx, {
    uniqueName,
    raffleId,
    chunkStart,
    chunkEnd,
  });

  if (!available.length) return 0;

  const [blocked, awards] = await Promise.all([
    blockedNumbersQ.fetchExistingInRange(trx, { raffleId, chunkStart, chunkEnd }),
    awardNumbersQ.fetchInRange(trx, { raffleId, chunkStart, chunkEnd }),
  ]);

  const eligible = eligibleNumbersForChunk({ available, blocked, awards });
  if (!eligible.length) return 0;

  const rows = buildBlockedRows({
    eligible,
    raffleId,
    userId,
    position,
    minValue,
    maxValue,
  });

  await blockedNumbersQ.insertMany(trx, rows);
  await raffleNumbersQ.lockNumbers(trx, {
    uniqueName,
    raffleId,
    numbers: eligible,
  });

  return eligible.length;
}

async function execute({
  database,
  userId,
  uniqueName,
  raffleId,
  startRange,
  endRange,
  position,
  minValue,
  maxValue,
}) {
  const startedAt = Date.now();
  const db = await knex.connect(database);

  try {
    const raffle = await rafflesQ.fetchById(db, raffleId);
    if (!raffle) {
      return { ok: false, reason: "raffle_not_found", raffleId };
    }
    if (raffle.numbers_status !== "generated") {
      throw new Error("Gerando números do sorteio, aguarde!");
    }

    let totalInserted = 0;

    await db.transaction(async (trx) => {
      // Desabilita a trigger para evitar 1 UPDATE por row no raffle_counters.
      await trx.raw(
        "ALTER TABLE blocked_numbers DISABLE TRIGGER trg_update_available_numbers_blocked"
      );

      try {
        for (
          let chunkStart = startRange;
          chunkStart <= endRange;
          chunkStart += CHUNK_SIZE
        ) {
          const chunkEnd = Math.min(chunkStart + CHUNK_SIZE - 1, endRange);
          totalInserted += await processChunk(trx, {
            uniqueName,
            raffleId,
            userId,
            chunkStart,
            chunkEnd,
            position,
            minValue,
            maxValue,
          });
        }
      } finally {
        await trx.raw(
          "ALTER TABLE blocked_numbers ENABLE TRIGGER trg_update_available_numbers_blocked"
        );
      }

      if (totalInserted > 0) {
        await raffleCountersQ.decrementAvailable(trx, {
          raffleId,
          amount: totalInserted,
        });
      }

      await rafflesQ.bumpVersion(trx, raffleId);
    });

    await notificationsQ.insert(db, {
      type: "success",
      title: "Processamento finalizado!",
      message: "Os números foram bloqueados com sucesso!",
      userId,
    });

    return {
      ok: true,
      raffleId,
      totalInserted,
      elapsedMs: Date.now() - startedAt,
    };
  } finally {
    await tenantProcessingQ
      .finish(db, { userId, type: "blocked_numbers" })
      .catch(() => {});
    await db.destroy().catch(() => {});
  }
}

module.exports = { execute, processChunk, eligibleNumbersForChunk, CHUNK_SIZE };
