import { EmptyObject } from '../../util/types'

export interface AccountData {
  dsInfo: DsInfo
  hasMinimumDeviceForPhotosWeb: boolean
  iCDPEnabled: boolean
  webservices: Webservices
  pcsEnabled: boolean
  configBag: ConfigBag
  hsaTrustedBrowser: boolean
  appsOrder: string[]
  version: number
  isExtendedLogin: boolean
  pcsServiceIdentitiesIncluded: boolean
  hsaChallengeRequired: boolean
  requestInfo: RequestInfo
  pcsDeleted: boolean
  iCloudInfo: ICloudInfo
  apps: Apps
}

export interface Apps {
  calendar: EmptyObject
  reminders: EmptyObject
  keynote: Keynote
  settings: Find
  mail: Mail
  numbers: Keynote
  photos: EmptyObject
  pages: Keynote
  notes3: EmptyObject
  find: Find
  iclouddrive: EmptyObject
  newspublisher: Newspublisher
  fmf?: EmptyObject
  contacts: EmptyObject
}

export interface Find {
  canLaunchWithOneFactor: boolean
}

export interface Keynote {
  isQualifiedForBeta: boolean
}

export interface Mail {
  isCKMail: boolean
}

export interface Newspublisher {
  isHidden: boolean
}

export interface ConfigBag {
  urls: Urls
  accountCreateEnabled: string
}

export interface Urls {
  accountCreateUI: string
  accountLoginUI: string
  accountLogin: string
  accountRepairUI: string
  downloadICloudTerms: string
  repairDone: string
  accountAuthorizeUI: string
  vettingUrlForEmail: string
  accountCreate: string
  getICloudTerms: string
  vettingUrlForPhone: string
}

export interface DsInfo {
  lastName: string
  iCDPEnabled: boolean
  tantorMigrated: boolean
  dsid: string
  hsaEnabled: boolean
  ironcadeMigrated: boolean
  locale: string
  brZoneConsolidated: boolean
  isManagedAppleID: boolean
  'gilligan-invited': boolean
  appleIdAliases: unknown[]
  hsaVersion: number
  isPaidDeveloper: boolean
  countryCode: string
  notificationId: string
  primaryEmailVerified: boolean
  aDsID: string
  locked: boolean
  hasICloudQualifyingDevice: boolean
  primaryEmail: string
  appleIdEntries: AppleIDEntry[]
  'gilligan-enabled': boolean
  fullName: string
  languageCode: string
  appleId: string
  hasUnreleasedOS: boolean
  firstName: string
  iCloudAppleIdAlias: string
  notesMigrated: boolean
  beneficiaryInfo: BeneficiaryInfo
  hasPaymentInfo: boolean
  pcsDeleted: boolean
  appleIdAlias: string
  brMigrated: boolean
  statusCode: number
  familyEligible: boolean
  isCustomDomainsFeatureAvailable?: boolean
  isHideMyEmailFeatureAvailable?: boolean
}

export interface AppleIDEntry {
  isPrimary: boolean
  type: string
  value: string
}

export interface BeneficiaryInfo {
  isBeneficiary: boolean
}

export interface ICloudInfo {
  SafariBookmarksHasMigratedToCloudKit: boolean
}

export interface RequestInfo {
  country: string
  timeZone: string
}

export interface Webservices {
  reminders: Archivews
  ckdatabasews: Ckdatabasews
  photosupload: Ckdatabasews
  photos: Ckdatabasews
  drivews: Ckdatabasews
  uploadimagews: Archivews
  schoolwork: EmptyObject
  cksharews: Archivews
  findme: Archivews
  ckdeviceservice: Ckdeviceservice
  iworkthumbnailws: Archivews
  calendar: Archivews
  docws: Ckdatabasews
  settings: Archivews
  ubiquity: Archivews
  streams: Archivews
  keyvalue: Archivews
  archivews: Archivews
  push: Archivews
  iwmb: Archivews
  iworkexportws: Archivews
  geows: Archivews
  account: Account
  fmf?: Archivews
  contacts: Archivews
}

export interface Account {
  iCloudEnv: ICloudEnv
  url: string
  status: Status
}

export interface ICloudEnv {
  shortId: string
  vipSuffix: string
}

// export enum Status {
//   Active = 'active',
// }
export type Status = 'active'

export interface Archivews {
  url: string
  status: Status
}

export interface Ckdatabasews {
  pcsRequired: boolean
  url: string
  status: Status
  uploadUrl?: string
}

export interface Ckdeviceservice {
  url: string
}
