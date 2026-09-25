import { initializeAppData } from "./routes/nufatur";
import { logger } from "./lib/logger";

initializeAppData()
  .then(() => {
    logger.info("Application bootstrap completed");
  })
  .catch((error: unknown) => {
    logger.error({ err: error }, "Application bootstrap failed");
    process.exitCode = 1;
  });
