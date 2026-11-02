// Entry point: connect to MongoDB, then start the server.
const mongoose = require("mongoose");
const config = require("./src/config");
const { createApp } = require("./src/app");
const { prepareDatabase } = require("./src/prepareDatabase");

async function main() {
  await mongoose.connect(config.mongoUri);
  console.log("MongoDB connected");

  await prepareDatabase(); // indexes, the Global room, and moving old rooms into a channel

  const { server } = createApp();
  server.listen(config.port, () => {
    console.log(`Server running at http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error("Failed to start:", err.message);
  process.exit(1);
});
