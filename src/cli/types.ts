export type EnvFiles = {
  sessionFile: string
  cacheFile: string
}

export type Env = EnvFiles & {
  raw: boolean
  noCache: boolean
}
