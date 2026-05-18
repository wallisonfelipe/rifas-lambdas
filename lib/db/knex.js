const knexLib = require("knex");
const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");

let cachedCreds = null;
let secretsClient = null;

function getSecretsClient() {
  if (!secretsClient) {
    secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION });
  }
  return secretsClient;
}

async function getCredentials() {
  if (cachedCreds) return cachedCreds;

  if (process.env.IS_OFFLINE === "true") {
    const user = process.env.DB_USERNAME;
    const password = process.env.DB_PASSWORD;
    if (!user || !password) {
      throw new Error("IS_OFFLINE=true requer DB_USERNAME/DB_PASSWORD");
    }
    cachedCreds = { user, password };
    return cachedCreds;
  }

  const secretId = process.env.DB_SECRET_ARN;
  if (!secretId) throw new Error("DB_SECRET_ARN nao configurado");

  const resp = await getSecretsClient().send(
    new GetSecretValueCommand({ SecretId: secretId })
  );
  if (!resp.SecretString) throw new Error("Secret sem SecretString");

  const parsed = JSON.parse(resp.SecretString);
  cachedCreds = { user: parsed.username, password: parsed.password };
  return cachedCreds;
}

/**
 * Cria uma instancia de Knex conectada ao Postgres do tenant indicado.
 * Cada invocacao Lambda deve chamar `connect(database)` no inicio do handler e
 * `db.destroy()` no `finally` — sem pool compartilhado (paridade com lib/pg.js).
 */
async function connect(database) {
  if (!/^[a-z0-9_]+$/.test(database)) {
    throw new Error(`Database invalido: ${database}`);
  }

  const creds = await getCredentials();
  const isOffline = process.env.IS_OFFLINE === "true";

  const db = knexLib({
    client: "pg",
    connection: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || "5432", 10),
      database,
      user: creds.user,
      password: creds.password,
      ssl: isOffline ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
      keepAlive: true,
    },
    pool: { min: 0, max: 1, idleTimeoutMillis: 1000 },
    acquireConnectionTimeout: 15000,
  });

  return db;
}

module.exports = { connect };
