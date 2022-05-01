import { DriveApiEnv } from './drive-api-env'

export type DepDriveApi<
  K extends keyof DriveApiEnv,
  RootKey extends string | number | symbol = 'api',
> = Record<
  RootKey,
  Pick<DriveApiEnv, K>
>

export { DriveApiEnv } from './drive-api-env'
