function decrementAvailable(db, { raffleId, amount }) {
  if (!amount) return Promise.resolve(0);
  return db("raffle_counters")
    .where("raffle_id", raffleId)
    .decrement("available_numbers", amount);
}

module.exports = { decrementAvailable };
