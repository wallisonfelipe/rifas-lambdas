#!/usr/bin/env node
/**
 * Smoke test local da Lambda generateRaffleNumbers.
 *
 * Pre-requisitos:
 * - Postgres local rodando com schema do api/ migrado (via docker-compose.local.yml ou similar).
 * - O caller exporta:
 *     export IS_OFFLINE=true
 *     export DB_HOST=localhost
 *     export DB_PORT=5432
 *     export DB_USERNAME=root
 *     export DB_PASSWORD=root
 *
 * Uso:
 *   node scripts/local-test-generate-numbers.js [database] [uniqueName] [numbersQuantity]
 *
 * Exemplo:
 *   node scripts/local-test-generate-numbers.js rifamaster localdev 1000
 *
 * O script:
 * 1. Cria um user 'localtest' (ou reusa) no DB.
 * 2. Cria a tabela raffle_numbers_{uniqueName} se nao existir.
 * 3. Cria/recria uma raffle de teste com `numbers_quantity` definido.
 * 4. Chama o handler da Lambda direto.
 * 5. Imprime resultado + count na tabela.
 */

const { Client } = require("pg");
const path = require("path");

process.env.IS_OFFLINE = process.env.IS_OFFLINE || "true";
process.env.DB_HOST = process.env.DB_HOST || "localhost";
process.env.DB_PORT = process.env.DB_PORT || "5432";
process.env.DB_USERNAME = process.env.DB_USERNAME || "root";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "root";
process.env.AWS_REGION = process.env.AWS_REGION || "sa-east-1";

const database = process.argv[2] || "rifamaster";
const uniqueName = process.argv[3] || "localtest";
const numbersQuantity = parseInt(process.argv[4] || "1000", 10);

async function adminClient() {
  const c = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    database,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
  });
  await c.connect();
  return c;
}

async function ensureTenantTable(c) {
  const tableName = `raffle_numbers_${uniqueName}`;
  const idxName = `number_index_${uniqueName}`;
  await c.query(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id BIGSERIAL PRIMARY KEY,
      number BIGINT NOT NULL,
      raffle_id BIGINT NULL,
      client_id BIGINT NULL,
      payment_id BIGINT NULL,
      paid BOOLEAN NOT NULL DEFAULT false,
      locked BOOLEAN NOT NULL DEFAULT false,
      paid_at TIMESTAMP NULL,
      created_at TIMESTAMP NULL,
      updated_at TIMESTAMP NULL,
      UNIQUE (raffle_id, number)
    )
  `);
  await c.query(
    `CREATE INDEX IF NOT EXISTS ${idxName} ON ${tableName}(number)`
  );
}

async function ensureUser(c) {
  const { rows } = await c.query(
    `SELECT id FROM users WHERE unique_name = $1 LIMIT 1`,
    [uniqueName]
  );
  if (rows[0]) return rows[0].id;

  const insert = await c.query(
    `INSERT INTO users (name, email, password, unique_name, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     RETURNING id`,
    ["Local Test", `${uniqueName}@local.test`, "x", uniqueName]
  );
  return insert.rows[0].id;
}

async function recreateRaffle(c, userId) {
  await c.query(
    `DELETE FROM raffles WHERE user_id = $1 AND title = 'LOCAL_TEST_RAFFLE'`,
    [userId]
  );
  const { rows } = await c.query(
    `INSERT INTO raffles
       (title, slug, status, numbers_status, short_description, description,
        show_home, show_sell_progress, allow_promotion, close_at_draw_date,
        show_draw_date_to_users, cpf_is_required, email_is_required,
        numbers_price, numbers_quantity, time_reservation_expires_minutes,
        max_buy_by_user, min_numbers, max_numbers,
        show_top_daily_buyers, show_awards, show_top_general_buyers, show_award_numbers,
        allow_affiliates, anti_spam_quantity_reservation, anti_spam_block_time_minutes,
        user_id, created_at, updated_at)
     VALUES ('LOCAL_TEST_RAFFLE', 'local-test-raffle', 'active', 'waiting',
             'desc', 'desc',
             false, false, false, false,
             false, false, false,
             1.00, $1, 0,
             0, 0, 0,
             false, false, false, false,
             false, 0, 0,
             $2, NOW(), NOW())
     RETURNING id, type`,
    [numbersQuantity, userId]
  );
  return rows[0].id;
}

async function main() {
  console.log(`-> conectando em ${database} como ${process.env.DB_USERNAME}`);
  const c = await adminClient();

  try {
    await ensureTenantTable(c);
    const userId = await ensureUser(c);
    const raffleId = await recreateRaffle(c, userId);
    console.log(
      `-> raffle ${raffleId} criada (user_id=${userId}, numbers_quantity=${numbersQuantity}, table=raffle_numbers_${uniqueName})`
    );

    const handlerPath = path.resolve(
      __dirname,
      "..",
      "handlers",
      "generate-raffle-numbers.js"
    );
    const { handler } = require(handlerPath);

    console.log("-> invocando handler...");
    const t0 = Date.now();
    const result = await handler({
      raffleId,
      uniqueName,
      database,
      tenant: "local",
    });
    const elapsed = Date.now() - t0;
    console.log(`-> handler ok em ${elapsed}ms:`, result);

    const { rows: countRows } = await c.query(
      `SELECT count(*)::int AS n FROM raffle_numbers_${uniqueName} WHERE raffle_id = $1`,
      [raffleId]
    );
    console.log(`-> count em raffle_numbers_${uniqueName}:`, countRows[0].n);

    const { rows: statusRows } = await c.query(
      `SELECT numbers_status, numbers_generating_at FROM raffles WHERE id = $1`,
      [raffleId]
    );
    console.log("-> status:", statusRows[0]);

    const { rows: notifRows } = await c.query(
      `SELECT type, title, message, created_at FROM notifications
        WHERE title LIKE 'Sorteio ''LOCAL_TEST_RAFFLE'%' ORDER BY id DESC LIMIT 1`
    );
    console.log("-> ultima notificacao:", notifRows[0] || null);
  } finally {
    await c.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error("ERRO:", err);
  process.exit(1);
});
