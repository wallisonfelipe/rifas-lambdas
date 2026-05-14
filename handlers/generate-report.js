const service = require("../services/generate-report.service");

exports.handler = async (event) => {
	const payload = event && event.detail ? event.detail : event;

	const input = {
		userId: payload?.userId,
		raffleId: payload?.raffleId,
		raffleTitle: payload?.raffleTitle,
		format: payload?.format,
		tab: payload?.tab,
		tenant: payload?.tenant,
		database: payload?.database,
		appName: payload?.appName,
		bunny: payload?.bunny,
	};

	console.log(
		JSON.stringify({
			level: "info",
			msg: "generate-report:start",
			userId: input.userId,
			raffleId: input.raffleId,
			format: input.format,
			tab: input.tab,
			tenant: input.tenant,
		})
	);

	try {
		const result = await service.execute(input);
		console.log(
			JSON.stringify({
				level: "info",
				msg: "generate-report:done",
				raffleId: input.raffleId,
				rowCount: result.rowCount,
				elapsedMs: result.elapsedMs,
			})
		);
		return result;
	} catch (err) {
		console.error(
			JSON.stringify({
				level: "error",
				msg: "generate-report:fail",
				raffleId: input.raffleId,
				error: err && err.message,
			})
		);

		try {
			await service.markFailure(input, (err && err.message) || "erro desconhecido");
		} catch (markErr) {
			console.error(
				JSON.stringify({
					level: "error",
					msg: "generate-report:mark-failure-fail",
					raffleId: input.raffleId,
					error: markErr && markErr.message,
				})
			);
		}

		throw err;
	}
};
