import * as L from '../../src/logging'

export const enableDebug = (enable: boolean): void => {
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
