import { apiLogger, cacheLogger, logger, stderrLogger, timeLogger } from "./logging";

export {
  apiLogger,
  authLogger,
  cacheLogger,
  httpfilelogger,
  initLoggers as initLogging,
  logger,
  stderrLogger,
  timeLogger,
} from "./logging";

export const defaultLoggers = [
  logger,
  cacheLogger,
  stderrLogger,
  apiLogger,
  timeLogger,
];

export * from "./debug-time";
export { loggerIO } from "./loggerIO";
