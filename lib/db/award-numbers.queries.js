function fetchInRange(db, { raffleId, chunkStart, chunkEnd }) {
  return db("award_numbers")
    .select("number")
    .where("raffle_id", raffleId)
    .whereBetween("number", [chunkStart, chunkEnd])
    .then((rows) => rows.map((r) => Number(r.number)));
}

module.exports = { fetchInRange };
