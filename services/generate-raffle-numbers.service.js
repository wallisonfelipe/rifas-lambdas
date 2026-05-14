const { types } = require("pg");
const { from: copyFrom } = require("pg-copy-streams");
const pg = require("../lib/pg");
const { shuffleMt19937 } = require("../lib/shuffle");
const { raffleNumbersTable } = require("../lib/raffle-tables");

types.setTypeParser(20, (val) => parseInt(val, 10));
types.setTypeParser(1114, (val) => val);
types.setTypeParser(1184, (val) => val);

const STALE_THRESHOLD_MS = 15 * 60 * 1000;

function isStale(raffle) {
  if (raffle.numbers_status === "error") return true;
  if (raffle.numbers_status !== "generating") return false;
  if (!raffle.numbers_generating_at) return true;
  const startedAt = new Date(raffle.numbers_generating_at).getTime();
  if (Number.isNaN(startedAt)) return true;
  return Date.now() - startedAt >= STALE_THRESHOLD_MS;
}

async function fetchRaffle(client, raffleId) {
  const { rows } = await client.query(
    `SELECT id, title, type, user_id, numbers_quantity, numbers_status, numbers_generating_at
       FROM raffles
      WHERE id = $1`,
    [raffleId]
  );
  return rows[0] || null;
}

async function fetchAwardNumbers(client, raffleId) {
  const { rows } = await client.query(
    `SELECT number FROM award_numbers WHERE raffle_id = $1`,
    [raffleId]
  );
  return rows.map((r) => Number(r.number));
}

async function fetchBlockedNumbers(client, raffleId) {
  const { rows } = await client.query(
    `SELECT number FROM blocked_numbers WHERE raffle_id = $1`,
    [raffleId]
  );
  return rows.map((r) => Number(r.number));
}

function buildNumbers(quantity, awardNumbers) {
  const total = Number(quantity);
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error(`numbers_quantity invalido: ${quantity}`);
  }

  const excluded = new Set(awardNumbers.map((n) => Number(n)));
  const remaining = total - excluded.size;
  const buf = new Int32Array(remaining);

  let idx = 0;
  for (let n = 0; n < total; n++) {
    if (excluded.has(n)) continue;
    buf[idx++] = n;
  }
  return buf;
}

function copyNumbers(client, table, raffleId, numbers) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn, val) => {
      if (settled) return;
      settled = true;
      client.removeListener("error", onClientError);
      fn(val);
    };
    const onClientError = (err) => settle(reject, err);
    client.on("error", onClientError);

    const stream = client.query(
      copyFrom(`COPY ${table}(raffle_id, number) FROM STDIN WITH (FORMAT text)`)
    );
    stream.on("error", (err) => settle(reject, err));
    stream.on("finish", () => settle(resolve));

    const chunkSize = 65536;
    let i = 0;

    function pump() {
      if (settled) return;
      let buf = "";
      let canKeepWriting = true;
      while (i < numbers.length && canKeepWriting) {
        buf += `${raffleId}\t${numbers[i++]}\n`;
        if (buf.length >= chunkSize) {
          canKeepWriting = stream.write(buf);
          buf = "";
        }
      }
      if (buf.length > 0) {
        canKeepWriting = stream.write(buf) && canKeepWriting;
      }
      if (i < numbers.length) {
        stream.once("drain", pump);
      } else {
        stream.end();
      }
    }

    pump();
  });
}

async function deleteAwardNumbersFromTable(client, table, raffleId, awardNumbers) {
  if (awardNumbers.length === 0) return;
  await client.query(
    `DELETE FROM ${table} WHERE raffle_id = $1 AND number = ANY($2::bigint[])`,
    [raffleId, awardNumbers]
  );
}

async function markBlockedNumbersLocked(client, table, raffleId, blockedNumbers) {
  if (blockedNumbers.length === 0) return;
  await client.query(
    `UPDATE ${table} SET locked = true
      WHERE raffle_id = $1 AND number = ANY($2::bigint[])`,
    [raffleId, blockedNumbers]
  );
}

async function insertSuccessNotification(client, raffle) {
  await client.query(
    `INSERT INTO notifications (type, title, message, user_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4,
             (NOW() AT TIME ZONE 'America/Sao_Paulo'),
             (NOW() AT TIME ZONE 'America/Sao_Paulo'))`,
    [
      "success",
      `Sorteio '${raffle.title}' gerado com sucesso!`,
      "Processo finalizado.",
      null,
    ]
  );
}

async function execute({ raffleId, uniqueName, database }) {
  const startedAt = Date.now();
  const table = raffleNumbersTable(uniqueName);
  const client = await pg.connect(database);

  try {
    const raffle = await fetchRaffle(client, raffleId);
    if (!raffle) {
      return { ok: false, reason: "raffle_not_found", raffleId };
    }
    if (raffle.numbers_status === "generated") {
      return { ok: true, skipped: true, reason: "already_generated", raffleId };
    }

    if (isStale(raffle)) {
      await client.query(`DELETE FROM ${table} WHERE raffle_id = $1`, [raffleId]);
    } else if (raffle.numbers_status === "generating") {
      return { ok: false, reason: "in_progress", raffleId };
    }

    await client.query(
      `UPDATE raffles
          SET numbers_status = 'generating',
              numbers_generating_at = NOW()
        WHERE id = $1`,
      [raffleId]
    );

    const awardNumbers = await fetchAwardNumbers(client, raffleId);
    const numbers = buildNumbers(raffle.numbers_quantity, awardNumbers);

    const shuffled = raffle.type === "normal";
    if (shuffled) shuffleMt19937(numbers);

    await copyNumbers(client, table, raffleId, numbers);
    await deleteAwardNumbersFromTable(client, table, raffleId, awardNumbers);

    const blockedNumbers = await fetchBlockedNumbers(client, raffleId);
    await markBlockedNumbersLocked(client, table, raffleId, blockedNumbers);

    await client.query(`ANALYZE ${table}`);

    await client.query(
      `UPDATE raffles SET numbers_status = 'generated' WHERE id = $1`,
      [raffleId]
    );

    await insertSuccessNotification(client, raffle);

    return {
      ok: true,
      raffleId,
      count: numbers.length,
      shuffled,
      elapsedMs: Date.now() - startedAt,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

module.exports = { execute };
