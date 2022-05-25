import * as L from '../../src/util/logging'

L.initLoggers(
  { debug: false },
  [
    L.logger,
    L.cacheLogger,
    L.stderrLogger,
    L.apiLogger,
  ],
)
