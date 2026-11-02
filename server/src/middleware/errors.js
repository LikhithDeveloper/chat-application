function notFound(req, res) {
  res.status(404).json({ error: "Not found" });
}

// Last-resort handler. Never leaks stack traces or internals to the client.
function errorHandler(err, req, res, next) {
  if (err.name === "CastError") return res.status(400).json({ error: "Invalid id" });
  if (err.code === 11000) return res.status(409).json({ error: "Already exists" });
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
}

module.exports = { notFound, errorHandler };
