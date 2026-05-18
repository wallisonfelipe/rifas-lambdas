/**
 * Numeros ja bloqueados num intervalo (para nao re-bloquear).
 */
function fetchExistingInRange(db, { raffleId, chunkStart, chunkEnd }) {
  return db("blocked_numbers")
    .select("number")
    .where("raffle_id", raffleId)
    .whereBetween("number", [chunkStart, chunkEnd])
    .then((rows) => rows.map((r) => Number(r.number)));
}

function insertMany(db, rows) {
  if (!rows.length) return Promise.resolve(0);
  return db("blocked_numbers")
    .insert(rows)
    .then(() => rows.length);
}

/**
 * Conta blocked_numbers sem ganhador vinculado (= passiveis de exclusao em massa).
 */
function countUnclaimed(db, { raffleId }) {
  return db("blocked_numbers")
    .where("raffle_id", raffleId)
    .whereNull("client_id")
    .count({ count: "*" })
    .first()
    .then((row) => Number(row && row.count));
}

/**
 * Pega o proximo chunk de blocked_numbers sem ganhador vinculado.
 */
function fetchUnclaimedChunk(db, { raffleId, limit }) {
  return db("blocked_numbers")
    .select("number")
    .where("raffle_id", raffleId)
    .whereNull("client_id")
    .limit(limit)
    .then((rows) => rows.map((r) => Number(r.number)));
}

/**
 * Remove blocked_numbers sem ganhador vinculado para os numeros indicados.
 * Retorna a quantidade efetivamente deletada.
 */
function deleteUnclaimedByNumbers(db, { raffleId, numbers }) {
  if (!numbers.length) return Promise.resolve(0);
  return db("blocked_numbers")
    .where("raffle_id", raffleId)
    .whereNull("client_id")
    .whereIn("number", numbers)
    .del();
}

module.exports = {
  fetchExistingInRange,
  insertMany,
  countUnclaimed,
  fetchUnclaimedChunk,
  deleteUnclaimedByNumbers,
};
