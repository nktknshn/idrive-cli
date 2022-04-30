import { DriveApi } from './drive-api-type'
export * as DriveApi from '../api'

export type DepDriveApi<
  K extends keyof DriveApi,
  RootKey extends string | number | symbol = 'api',
> = Record<
  RootKey,
  Pick<DriveApi, K>
>
