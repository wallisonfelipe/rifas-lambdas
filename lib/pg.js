const { Client } = require("pg");
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

  // Em modo offline, aceita credenciais direto da env (sem Secrets Manager)
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

async function connect(database) {
  if (!/^[a-z0-9_]+$/.test(database)) {
    throw new Error(`Database invalido: ${database}`);
  }

  const creds = await getCredentials();
  const isOffline = process.env.IS_OFFLINE === "true";

  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "5432", 10),
    database,
    user: creds.user,
    password: creds.password,
    ssl: isOffline ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });

  // Sem este listener, um erro no socket fora de uma query ativa virou
  // Uncaught Exception e matou o runtime da Lambda (Runtime.ExitError).
  client.on("error", (err) => {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "pg-client:socket-error",
        error: err && err.message,
        code: err && err.code,
      })
    );
  });

  await client.connect();
  return client;
}

module.exports = { connect };
