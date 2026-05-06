const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

const isOffline = process.env.IS_OFFLINE === "true";

const client = new DynamoDBClient({
  region: "sa-east-1",
  endpoint: isOffline ? "http://dynamodb:8000" : undefined,
  credentials: isOffline
    ? {
        accessKeyId: "fake",
        secretAccessKey: "fake",
      }
    : undefined,
});

const docClient = DynamoDBDocumentClient.from(client);

module.exports = { docClient };