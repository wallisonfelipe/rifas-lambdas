const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { randomUUID } = require("crypto");

const client = new DynamoDBClient({
  region: "sa-east-1",
  endpoint: process.env.IS_OFFLINE ? "http://dynamodb:8000" : undefined,
  credentials: process.env.IS_OFFLINE
    ? { accessKeyId: "fake", secretAccessKey: "fake" }
    : undefined,
});

const docClient = DynamoDBDocumentClient.from(client);

const PAYMENTS_TABLE = process.env.PAYMENTS_TABLE || "payments-generated-dev";
console.log(PAYMENTS_TABLE)
async function seed() {
  const now = Date.now();

  for (let i = 0; i < 5; i++) {
    const paymentId = randomUUID();

    await docClient.send(
      new PutCommand({
        TableName: PAYMENTS_TABLE,
        Item: {
          paymentId,
          entityType: "PAYMENT",
          createdAt: new Date(now - i * 10000).toISOString(),
          createdAtEpoch: now - i * 10000,
          tenant: "acoesmilionarias",
          externalId: `seed-${i}`,
          gateway: "codepay",
          gatewayPaymentId: `gw-${i}`,
          value: 10 + i,
          status: "completed",
        },
      })
    );

    console.log("Inserted:", paymentId);
  }

  console.log("Seed finished.");
}

seed();