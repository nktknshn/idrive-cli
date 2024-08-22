import { type AccountData } from '../icloud-authentication/type-accountdata'
import { BaseState } from '../icloud-core/icloud-request'
import { SA } from '../util/types'

export type DepAuthenticateSession = {
  authenticateSession: <S extends BaseState>() => SA<S, AccountData>
}
