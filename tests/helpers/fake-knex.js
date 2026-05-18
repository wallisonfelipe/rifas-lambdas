/**
 * Knex query builder dublê para testes unitarios.
 * Cada chamada de operacao terminal (`.then`/`.first`/`.update`/etc.) consulta
 * uma fila de respostas pre-programadas por tabela. Suficiente para verificar
 * o comportamento da service sem precisar de um Postgres real.
 */

function makeFakeKnex() {
  const calls = [];
  const responses = new Map(); // table -> array de respostas (FIFO)

  function setResponses(table, list) {
    responses.set(table, [...list]);
  }

  function nextResponse(table, op) {
    const queue = responses.get(table) || [];
    if (!queue.length) {
      throw new Error(`Resposta nao programada para ${table} (${op})`);
    }
    return queue.shift();
  }

  function builder(table) {
    const state = { table, op: "select", conditions: [] };

    const chain = {
      select(...cols) {
        state.op = "select";
        state.cols = cols;
        return chain;
      },
      where(...args) {
        state.conditions.push(["where", args]);
        return chain;
      },
      whereBetween(...args) {
        state.conditions.push(["whereBetween", args]);
        return chain;
      },
      whereIn(...args) {
        state.conditions.push(["whereIn", args]);
        return chain;
      },
      whereNull(...args) {
        state.conditions.push(["whereNull", args]);
        return chain;
      },
      forUpdate() {
        state.forUpdate = true;
        return chain;
      },
      skipLocked() {
        state.skipLocked = true;
        return chain;
      },
      limit(n) {
        state.limit = n;
        return chain;
      },
      count(arg) {
        state.op = "count";
        state.countArg = arg;
        return chain;
      },
      first() {
        state.op = "first";
        calls.push(state);
        return Promise.resolve(nextResponse(table, "first"));
      },
      insert(rows) {
        state.op = "insert";
        state.rows = rows;
        calls.push(state);
        return Promise.resolve(nextResponse(table, "insert"));
      },
      update(payload) {
        state.op = "update";
        state.payload = payload;
        calls.push(state);
        return Promise.resolve(nextResponse(table, "update"));
      },
      del() {
        state.op = "del";
        calls.push(state);
        return Promise.resolve(nextResponse(table, "del"));
      },
      increment(col, amount) {
        state.op = "increment";
        state.column = col;
        state.amount = amount;
        calls.push(state);
        return Promise.resolve(nextResponse(table, "increment"));
      },
      decrement(col, amount) {
        state.op = "decrement";
        state.column = col;
        state.amount = amount;
        calls.push(state);
        return Promise.resolve(nextResponse(table, "decrement"));
      },
      then(onFulfilled, onRejected) {
        state.op = state.op || "select";
        calls.push(state);
        return Promise.resolve(nextResponse(table, "select")).then(
          onFulfilled,
          onRejected
        );
      },
    };

    return chain;
  }

  function db(table) {
    return builder(table);
  }

  db.raw = (sql) => ({ __raw: sql });

  db.transaction = async (fn) => {
    const trx = (table) => builder(table);
    trx.raw = db.raw;
    return fn(trx);
  };

  db.destroy = () => Promise.resolve();

  return {
    db,
    calls,
    setResponses,
  };
}

module.exports = { makeFakeKnex };
