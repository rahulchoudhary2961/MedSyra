const fs = require("fs");
const path = require("path");
const pool = require("../config/db");

const seedsDir = path.resolve(__dirname, "../../seeds");

const runSeeds = async () => {
  const files = fs
    .readdirSync(seedsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(seedsDir, file), "utf8");
    await pool.query(sql);
    console.log(`Executed seed: ${file}`);
  }

  console.log("Seeding complete");
};

runSeeds()
  .catch((error) => {
    console.error("Seeding failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
