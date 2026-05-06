const { execute } = require("../services/generate-raffle-numbers.service");
const { markRaffleError } = require("../services/raffle-status.service");

exports.handler = async (event) => {
  const payload = event && event.detail ? event.detail : event;

  const raffleId = payload?.raffleId;
  const uniqueName = payload?.uniqueName;
  const database = payload?.database;
  const tenant = payload?.tenant;

  if (!raffleId || !uniqueName || !database) {
    throw new Error("raffleId/uniqueName/database obrigatorios");
  }

  console.log(
    JSON.stringify({
      level: "info",
      msg: "generate-raffle-numbers:start",
      raffleId,
      uniqueName,
      tenant,
    })
  );

  try {
    const result = await execute({ raffleId, uniqueName, database });
    console.log(
      JSON.stringify({
        level: "info",
        msg: "generate-raffle-numbers:done",
        raffleId,
        result,
      })
    );
    return result;
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "generate-raffle-numbers:fail",
        raffleId,
        error: err && err.message,
      })
    );

    try {
      await markRaffleError(database, raffleId, err && err.message);
    } catch (markErr) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "generate-raffle-numbers:mark-error-fail",
          raffleId,
          error: markErr && markErr.message,
        })
      );
    }

    throw err;
  }
};
