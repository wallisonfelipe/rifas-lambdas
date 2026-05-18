const { raffleNumbersTable } = require("../raffle-tables");

/**
 * Numeros vendaveis (locked=false, sem client/payment) num intervalo, pelo tenant.
 * Equivalente ao trecho em RaffleNumbers::withUser($user)->whereBetween(...)
 * ->where('locked', false)->whereNull(...)->lockForUpdate('SKIP LOCKED').
 */
function fetchAvailableInRange(
  db,
  { uniqueName, raffleId, chunkStart, chunkEnd }
) {
  const table = raffleNumbersTable(uniqueName);
  return db(table)
    .select("number")
    .where("raffle_id", raffleId)
    .whereBetween("number", [chunkStart, chunkEnd])
    .where("locked", false)
    .whereNull("client_id")
    .whereNull("payment_id")
    .forUpdate()
    .skipLocked()
    .then((rows) => rows.map((r) => Number(r.number)));
}

/**
 * Marca raffle_numbers como locked=true para os numeros que acabaram de ser inseridos
 * em blocked_numbers. Mantem paridade com o UPDATE ... lockForUpdate() do Service PHP.
 */
function lockNumbers(db, { uniqueName, raffleId, numbers }) {
  if (!numbers.length) return Promise.resolve(0);
  const table = raffleNumbersTable(uniqueName);
  return db(table)
    .where("raffle_id", raffleId)
    .whereIn("number", numbers)
    .update({ locked: true });
}

/**
 * Marca raffle_numbers como locked=false para os numeros indicados.
 * Usado quando o bloqueio em massa e desfeito (DeleteBlockedNumbersJob).
 */
function unlockNumbers(db, { uniqueName, raffleId, numbers }) {
  if (!numbers.length) return Promise.resolve(0);
  const table = raffleNumbersTable(uniqueName);
  return db(table)
    .where("raffle_id", raffleId)
    .whereIn("number", numbers)
    .update({ locked: false });
}

module.exports = { fetchAvailableInRange, lockNumbers, unlockNumbers };
