function insert(db, { type, title, message, userId, filePath = null }) {
  return db("notifications").insert({
    type,
    title,
    message,
    file_path: filePath,
    user_id: userId,
    created_at: db.raw("(NOW() AT TIME ZONE 'America/Sao_Paulo')"),
    updated_at: db.raw("(NOW() AT TIME ZONE 'America/Sao_Paulo')"),
  });
}

module.exports = { insert };
