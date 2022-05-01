import { DriveApi } from './drive-api-type'

export type DepDriveApi<
  K extends keyof DriveApi,
  RootKey extends string | number | symbol = 'api',
> = Record<
  RootKey,
  Pick<DriveApi, K>
>

export { DriveApi } from './drive-api-type'

export { DepAuthorizeSession } from './authorize'
