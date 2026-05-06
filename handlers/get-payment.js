const { GetCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../lib/dynamo");

const PAYMENTS_TABLE = process.env.PAYMENTS_TABLE;

exports.handler = async (event) => {
  const tenant = event?.pathParameters?.tenant;
  const paymentId = event?.pathParameters?.paymentId;

  if (!tenant || !paymentId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "tenant/paymentId obrigatórios" }),
    };
  }

  const resp = await docClient.send(
    new GetCommand({
      TableName: PAYMENTS_TABLE,
      Key: { paymentId }
    })
  );

  if (!resp?.Item || resp.Item.tenant !== tenant) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: "Not Found" }),
    };
  }

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(resp.Item),
  };
};