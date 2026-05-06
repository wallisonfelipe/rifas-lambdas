const pg = require("../lib/pg");

async function markRaffleError(database, raffleId, message) {
  const client = await pg.connect(database);
  try {
    await client.query(
      `UPDATE raffles
          SET numbers_status = 'error',
              error_message = $2
        WHERE id = $1`,
      [raffleId, (message || "").slice(0, 255)]
    );
  } finally {
    await client.end().catch(() => {});
  }
}

module.exports = { markRaffleError };
