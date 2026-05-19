function fetchById(db, raffleId) {
  return db("raffles")
    .select("id", "title", "user_id", "numbers_status", "version")
    .where("id", raffleId)
    .first();
}

function bumpVersion(db, raffleId) {
  return db("raffles").where("id", raffleId).increment("version", 1);
}

module.exports = { fetchById, bumpVersion };
