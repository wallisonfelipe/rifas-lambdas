const TENANT_REGEX = /^[a-zA-Z0-9_]+$/;

function assertTenant(uniqueName) {
  if (!uniqueName || !TENANT_REGEX.test(uniqueName)) {
    throw new Error(`unique_name invalido: ${uniqueName}`);
  }
}

function raffleNumbersTable(uniqueName) {
  assertTenant(uniqueName);
  return `raffle_numbers_${uniqueName}`;
}

function paymentNumbersTable(uniqueName) {
  assertTenant(uniqueName);
  return `payment_numbers_${uniqueName}`;
}

module.exports = { raffleNumbersTable, paymentNumbersTable, assertTenant };
