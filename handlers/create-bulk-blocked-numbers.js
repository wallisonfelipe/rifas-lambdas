const service = require("../services/create-bulk-blocked-numbers.service");
const knex = require("../lib/db/knex");
const notificationsQ = require("../lib/db/notifications.queries");
const tenantProcessingQ = require("../lib/db/tenant-processing.queries");

function pickPayload(event) {
  return event && event.detail ? event.detail : event;
}

function validate(payload) {
  const required = [
    "database",
    "userId",
    "uniqueName",
    "raffleId",
    "startRange",
    "endRange",
    "position",
  ];
  for (const key of required) {
    if (payload[key] === undefined || payload[key] === null) {
      throw new Error(`${key} obrigatorio`);
    }
  }
}

async function reportError(payload, message) {
  let db;
  try {
    db = await knex.connect(payload.database);
    await notificationsQ.insert(db, {
      type: "error",
      title: "Falha no processamento!",
      message,
      userId: payload.userId,
    });
    await tenantProcessingQ.finish(db, {
      userId: payload.userId,
      type: "blocked_numbers",
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "create-bulk-blocked-numbers:report-error-fail",
        error: err && err.message,
      })
    );
  } finally {
    if (db) await db.destroy().catch(() => {});
  }
}

exports.handler = async (event) => {
  const payload = pickPayload(event);

  validate(payload);

  console.log(
    JSON.stringify({
      level: "info",
      msg: "create-bulk-blocked-numbers:start",
      raffleId: payload.raffleId,
      userId: payload.userId,
      tenant: payload.tenant,
      range: [payload.startRange, payload.endRange],
    })
  );

  try {
    const result = await service.execute({
      database: payload.database,
      userId: payload.userId,
      uniqueName: payload.uniqueName,
      raffleId: payload.raffleId,
      startRange: payload.startRange,
      endRange: payload.endRange,
      position: payload.position,
      minValue: payload.minValue ?? null,
      maxValue: payload.maxValue ?? null,
    });

    console.log(
      JSON.stringify({
        level: "info",
        msg: "create-bulk-blocked-numbers:done",
        raffleId: payload.raffleId,
        result,
      })
    );

    return result;
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "create-bulk-blocked-numbers:fail",
        raffleId: payload.raffleId,
        error: err && err.message,
      })
    );

    await reportError(payload, err && err.message);

    throw err;
  }
};
