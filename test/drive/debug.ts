import * as L from '../../src/util/logging'

export const enableDebug = (enable: boolean) => {
  L.initLoggers(
    { debug: enable },
    [
      L.logger,
      L.cacheLogger,
      L.stderrLogger,
      L.apiLogger,
    ],
  )
}

enableDebug(false)
