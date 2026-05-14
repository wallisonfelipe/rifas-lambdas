const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const { types } = require("pg");
const pg = require("../lib/pg");
const { createCsvWriter } = require("../lib/csv-stream");
const bunny = require("../lib/bunny");

types.setTypeParser(20, (val) => parseInt(val, 10));
types.setTypeParser(1114, (val) => val);
types.setTypeParser(1184, (val) => val);

const TMP_DIR = "/tmp/rifas-reports";

const STATUS_LABELS = {
	csv: {
		paid: "Pago",
		manual: "Pago",
		pending: "Pendente",
		expired: "Expirado",
		canceled: "Cancelado",
		error: "Erro",
	},
	xlsx: {
		paid: "Pago",
		manual: "Pago",
		pending: "Reservado",
		expired: "Expirado",
		canceled: "Cancelado",
		error: "Erro",
	},
};

const TAB_LABELS = {
	paid: "Pagas",
	pending: "Reservadas",
	reserved: "Reservadas",
	expired: "Expiradas",
	affiliates: "Afiliados",
};

function tabLabel(tab) {
	return TAB_LABELS[tab] || "Todas";
}

function slugify(value) {
	return String(value || "")
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80) || "rifa";
}

function buildFileName(raffleTitle, tab, format) {
	const ts = new Date()
		.toISOString()
		.replace(/[:T]/g, "-")
		.replace(/\..+$/, "");
	const ext = format === "csv" ? "csv" : "xlsx";
	const tabSlug = slugify(tabLabel(tab)).replace(/-/g, "_");
	return `relatorio_${slugify(raffleTitle)}_${tabSlug}_${ts}.${ext}`;
}

function applyTabFilter(tab) {
	switch (tab) {
		case "paid":
			return " AND p.status IN ('paid', 'manual')";
		case "pending":
		case "reserved":
			return " AND p.status = 'pending'";
		case "expired":
			return " AND p.status = 'expired'";
		case "affiliates":
			return " AND p.affiliate_id IS NOT NULL";
		default:
			return "";
	}
}

const PAGE_SIZE = 1000;

function pageQuery(raffleId, tab, lastId) {
	const where = applyTabFilter(tab);
	return {
		text: `
			SELECT
				p.id,
				p.client_id,
				p.identifier,
				p.value,
				p.quantity,
				p.status,
				c.name  AS client_name,
				c.cpf   AS client_cpf,
				c.email AS client_email,
				c.phone AS client_phone,
				a.affiliate_code AS affiliate_code,
				a.phone          AS affiliate_phone,
				a.name           AS affiliate_name,
				p.created_at
			FROM payments p
			JOIN clients c ON c.id = p.client_id
			LEFT JOIN clients a ON a.id = p.affiliate_id
			WHERE p.raffle_id = $1
			  AND p.id > $2${where}
			ORDER BY p.id
			LIMIT $3
		`,
		values: [raffleId, lastId, PAGE_SIZE],
	};
}

async function fetchClientPaymentCounts(client, raffleId, tab) {
	const where = applyTabFilter(tab).replace(/\bp\./g, "");
	const { rows } = await client.query(
		`SELECT client_id, COUNT(*)::int AS payment_count
		   FROM payments
		  WHERE raffle_id = $1${where}
		  GROUP BY client_id`,
		[raffleId]
	);
	const map = new Map();
	for (const r of rows) map.set(Number(r.client_id), r.payment_count);
	return map;
}

async function* paginatePayments(client, raffleId, tab) {
	let lastId = 0;
	while (true) {
		const q = pageQuery(raffleId, tab, lastId);
		const { rows } = await client.query(q);
		if (rows.length === 0) return;
		for (const row of rows) yield row;
		lastId = rows[rows.length - 1].id;
		if (rows.length < PAGE_SIZE) return;
	}
}

function csvHeadings() {
	return [
		"ID",
		"Valor",
		"Quantidade",
		"Status",
		"CPF",
		"Nome",
		"Email",
		"Telefone",
		"Data da Compra",
		"Quantidade de compras",
	];
}

function csvRow(row, statusMap) {
	return [
		row.identifier,
		row.value,
		row.quantity,
		statusMap[row.status] || row.status,
		row.client_cpf,
		row.client_name,
		row.client_email,
		row.client_phone,
		row.created_at ? formatDateTime(row.created_at) : "",
		row.client_payment_count,
	];
}

function xlsxHeadings() {
	return [
		"ID",
		"Valor",
		"Quantidade",
		"Status",
		"CPF",
		"Nome",
		"Email",
		"Telefone",
		"Data da Compra",
		"Quantidade de compras",
		"Cód. Afiliado",
		"Telefone Afiliado",
		"Nome Afiliado",
	];
}

function xlsxRow(row, statusMap) {
	return [
		row.identifier,
		row.value !== null && row.value !== undefined ? Number(row.value) : null,
		row.quantity !== null && row.quantity !== undefined
			? Number(row.quantity)
			: null,
		statusMap[row.status] || row.status,
		row.client_cpf,
		row.client_name,
		row.client_email,
		row.client_phone,
		row.created_at ? new Date(row.created_at) : null,
		row.client_payment_count !== null && row.client_payment_count !== undefined
			? Number(row.client_payment_count)
			: 0,
		row.affiliate_code,
		row.affiliate_phone,
		row.affiliate_name,
	];
}

function formatDateTime(value) {
	const d = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(d.getTime())) return String(value);
	const pad = (n) => String(n).padStart(2, "0");
	return (
		`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
		`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
	);
}

async function streamCsv(client, raffleId, tab, counts, statusMap, filePath) {
	const writer = createCsvWriter(filePath);
	let count = 0;
	try {
		await writer.writeRow(csvHeadings());
		for await (const row of paginatePayments(client, raffleId, tab)) {
			row.client_payment_count = counts.get(Number(row.client_id)) || 0;
			const maybe = writer.writeRow(csvRow(row, statusMap));
			if (maybe) await maybe;
			count++;
		}
	} finally {
		await writer.close();
	}
	return count;
}

async function streamXlsx(client, raffleId, tab, counts, statusMap, filePath) {
	const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
		filename: filePath,
		useStyles: true,
	});
	const sheet = workbook.addWorksheet("Pagamentos");
	sheet.addRow(xlsxHeadings()).commit();

	const valueCol = 2;
	const quantityCol = 3;
	const dateCol = 9;
	const payCountCol = 10;

	let count = 0;
	for await (const row of paginatePayments(client, raffleId, tab)) {
		row.client_payment_count = counts.get(Number(row.client_id)) || 0;
		const excelRow = sheet.addRow(xlsxRow(row, statusMap));
		excelRow.getCell(valueCol).numFmt = "0.00";
		excelRow.getCell(quantityCol).numFmt = "0";
		excelRow.getCell(dateCol).numFmt = "yyyy-mm-dd hh:mm:ss";
		excelRow.getCell(payCountCol).numFmt = "0";
		excelRow.commit();
		count++;
	}

	await sheet.commit();
	await workbook.commit();
	return count;
}

async function insertNotification(client, userId, type, title, message, filePath) {
	await client.query(
		`INSERT INTO notifications (type, title, message, file_path, user_id, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5,
		         (NOW() AT TIME ZONE 'America/Sao_Paulo'),
		         (NOW() AT TIME ZONE 'America/Sao_Paulo'))`,
		[type, title, message, filePath, userId]
	);
}

async function finishProcessing(client, userId) {
	await client.query(
		`UPDATE tenant_processing_statuses
		    SET report_processing = false,
		        report_started_at = NULL,
		        updated_at = NOW()
		  WHERE user_id = $1`,
		[userId]
	);
}

function ensureTmpDir() {
	if (!fs.existsSync(TMP_DIR)) {
		fs.mkdirSync(TMP_DIR, { recursive: true });
	}
}

function safeUnlink(p) {
	try {
		fs.unlinkSync(p);
	} catch (_) {
		/* ignore */
	}
}

async function execute(input) {
	const {
		userId,
		raffleId,
		raffleTitle,
		format,
		tab,
		database,
		bunny: bunnyConfig,
		appName,
	} = input;

	if (!userId) throw new Error("userId obrigatorio");
	if (!raffleId) throw new Error("raffleId obrigatorio");
	if (!database) throw new Error("database obrigatorio");
	if (format !== "csv" && format !== "xlsx") {
		throw new Error(`format invalido: ${format}`);
	}
	if (!bunnyConfig || !bunnyConfig.storageZone || !bunnyConfig.apiKey) {
		throw new Error("bunny.storageZone/apiKey obrigatorios no payload");
	}

	const startedAt = Date.now();
	const statusMap =
		format === "csv" ? STATUS_LABELS.csv : STATUS_LABELS.xlsx;

	ensureTmpDir();
	const fileName = buildFileName(raffleTitle, tab, format);
	const tempPath = path.join(TMP_DIR, fileName);

	const client = await pg.connect(database);

	let rowCount = 0;
	try {
		// Defesas no nivel da sessao: cada query roda em auto-commit, mas se
		// algo travar (DDL pendurado, peer lock), falha rapido sem segurar nada.
		await client.query("SET statement_timeout = '600000'");
		await client.query("SET lock_timeout = '5000'");

		// Pre-agrega "quantidade de compras por cliente" em uma unica HashAgg.
		// Resultado fica em memoria da Lambda (1 entrada por client_id, ~16 bytes).
		const counts = await fetchClientPaymentCounts(client, raffleId, tab);

		if (format === "csv") {
			rowCount = await streamCsv(client, raffleId, tab, counts, statusMap, tempPath);
		} else {
			rowCount = await streamXlsx(client, raffleId, tab, counts, statusMap, tempPath);
		}

		const dateDir = new Date().toISOString().slice(0, 10);
		const remoteDir = `${String(appName || "").toLowerCase()}/reports/${dateDir}`;
		const fileUrl = await bunny.uploadFile({
			storageZone: bunnyConfig.storageZone,
			apiKey: bunnyConfig.apiKey,
			region: bunnyConfig.region,
			cdnUrl: bunnyConfig.cdnUrl,
			uploadPath: remoteDir,
			fileName,
			localFilePath: tempPath,
		});

		const formatLabel = format === "csv" ? "CSV" : "Excel";
		await insertNotification(
			client,
			userId,
			"info",
			"Relatório gerado com sucesso",
			`O relatório ${formatLabel} do sorteio '${raffleTitle}' (${tabLabel(tab)}) foi gerado e está disponível para download.`,
			fileUrl
		);

		await finishProcessing(client, userId);

		return {
			ok: true,
			raffleId,
			rowCount,
			fileUrl,
			elapsedMs: Date.now() - startedAt,
		};
	} finally {
		safeUnlink(tempPath);
		await client.end().catch(() => {});
	}
}

async function markFailure(input, errorMessage) {
	const { userId, raffleTitle, format, tab, database } = input || {};
	if (!userId || !database) return;
	const formatLabel = format === "csv" ? "CSV" : "Excel";
	const client = await pg.connect(database);
	try {
		await insertNotification(
			client,
			userId,
			"error",
			"Erro ao gerar relatório",
			`Ocorreu um erro ao gerar o relatório ${formatLabel} do sorteio '${raffleTitle}' (${tabLabel(tab)}): ${errorMessage}`,
			null
		);
		await finishProcessing(client, userId);
	} finally {
		await client.end().catch(() => {});
	}
}

module.exports = { execute, markFailure };
