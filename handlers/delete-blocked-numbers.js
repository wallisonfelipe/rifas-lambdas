const service = require("../services/delete-blocked-numbers.service");
const knex = require("../lib/db/knex");
const notificationsQ = require("../lib/db/notifications.queries");

function pickPayload(event) {
  return event && event.detail ? event.detail : event;
}

function validate(payload) {
  const required = ["database", "userId", "uniqueName", "raffleId"];
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
      title: "Exclusão dos numeros bloqueados com erro",
      message: "Entre em contato com suporte!",
      userId: null,
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "delete-blocked-numbers:report-error-fail",
        error: err && err.message,
        originalError: message,
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
      msg: "delete-blocked-numbers:start",
      raffleId: payload.raffleId,
      userId: payload.userId,
      tenant: payload.tenant,
    })
  );

  try {
    const result = await service.execute({
      database: payload.database,
      userId: payload.userId,
      uniqueName: payload.uniqueName,
      raffleId: payload.raffleId,
    });

    console.log(
      JSON.stringify({
        level: "info",
        msg: "delete-blocked-numbers:done",
        raffleId: payload.raffleId,
        result,
      })
    );

    return result;
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "delete-blocked-numbers:fail",
        raffleId: payload.raffleId,
        error: err && err.message,
      })
    );

    await reportError(payload, err && err.message);
    throw err;
  }
};
