// Validates req.body against a zod schema and replaces it with the cleaned result.
// Anything unexpected (wrong types, objects like {"$gt": ""}) is rejected and unknown
// fields are stripped, which also blocks NoSQL-injection attempts.
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.issues[0].message });
    }
    req.body = result.data;
    next();
  };
}

module.exports = { validate };
