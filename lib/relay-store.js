const { GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { randomUUID } = require("crypto");
const { docClient } = require("./dynamo");

const USERS_TABLE = process.env.USERS_TABLE;
const REQUESTS_TABLE = process.env.REQUESTS_TABLE;
const REQUEST_LOGS_TABLE = process.env.REQUEST_LOGS_TABLE;

async function getUser(pathUrl) {
  const { Item } = await docClient.send(
    new GetCommand({
      TableName: USERS_TABLE,
      Key: { pathUrl },
    })
  );
  return Item;
}

async function saveRequest({ requestId, user, payload }) {
  await docClient.send(
    new PutCommand({
      TableName: REQUESTS_TABLE,
      Item: {
        requestId,
        userName: user.userName,
        pathUrl: user.pathUrl,
        payload,
        createdAt: new Date().toISOString(),
      },
    })
  );
}

async function saveRequestLog({ requestId, status, responseCode, message }) {
  await docClient.send(
    new PutCommand({
      TableName: REQUEST_LOGS_TABLE,
      Item: {
        logId: randomUUID(),
        requestId,
        status,
        responseCode,
        message,
        createdAt: new Date().toISOString(),
      },
    })
  );
}

module.exports = { getUser, saveRequest, saveRequestLog };
