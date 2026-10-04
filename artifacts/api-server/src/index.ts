import app from "./app";
import { pool } from "@workspace/db";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"] ?? "3000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start(): Promise<void> {
  try {
    await pool.query(`
      ALTER TABLE company_settings
        ADD COLUMN IF NOT EXISTS admin_name varchar(160) NOT NULL DEFAULT 'Admin NUFATUR',
        ADD COLUMN IF NOT EXISTS admin_title varchar(160) NOT NULL DEFAULT 'Penanggung Jawab'
    `);
  } catch (error) {
    logger.error({ err: error }, "Company settings schema initialization failed");
    process.exit(1);
  }

  app.listen(port, "0.0.0.0", (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ host: "0.0.0.0", port }, "Server listening");
  });
}

void start();
