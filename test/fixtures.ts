import * as O from 'fp-ts/Option'
import { ICloudSessionValidated } from '../src/icloud/authorization/authorize'
import { AccountLoginResponseBody } from '../src/icloud/authorization/types'
import { ICloudSession } from '../src/icloud/session/session'

export const validSession: ICloudSession = {
  accountCountry: O.some('RUS'),
  authAttributes: O.some('authAttributes1'),
  cookies: {},
  password: 'password1',
  username: 'username1',
  scnt: O.some('scnt1'),
  sessionId: O.some('session1'),
  sessionToken: O.some('sessiontoken1'),
  trustToken: O.some('trustToken'),
}

export const validAccountdata: AccountLoginResponseBody = {
  'dsInfo': {
    'lastName': 'Lastname',
    'iCDPEnabled': false,
    'tantorMigrated': false,
    'dsid': '1234345678',
    'hsaEnabled': true,
    'ironcadeMigrated': true,
    'locale': 'ru-ru_RU',
    'brZoneConsolidated': false,
    'isManagedAppleID': false,
    'isCustomDomainsFeatureAvailable': true,
    'isHideMyEmailFeatureAvailable': true,
    'gilligan-invited': true,
    'appleIdAliases': [],
    'hsaVersion': 2,
    'isPaidDeveloper': false,
    'countryCode': 'RUS',
    'notificationId': 'notificationId1',
    'primaryEmailVerified': true,
    'aDsID': 'aDsID1',
    'locked': false,
    'hasICloudQualifyingDevice': true,
    'primaryEmail': 'user1@example.com',
    'appleIdEntries': [{ 'isPrimary': true, 'type': 'EMAIL', 'value': 'user1@example.com' }],
    'gilligan-enabled': true,
    'fullName': 'Firstname Lastname',
    'languageCode': 'ru-ru',
    'appleId': 'user1@example.com',
    'hasUnreleasedOS': true,
    'firstName': 'Firstname',
    'iCloudAppleIdAlias': '',
    'notesMigrated': true,
    'beneficiaryInfo': { 'isBeneficiary': false },
    'hasPaymentInfo': true,
    'pcsDeleted': false,
    'appleIdAlias': '',
    'brMigrated': true,
    'statusCode': 2,
    'familyEligible': true,
  },
  'hasMinimumDeviceForPhotosWeb': true,
  'iCDPEnabled': false,
  'webservices': {
    'reminders': { 'url': 'https://p46-remindersws.icloud.com:443', 'status': 'active' },
    'calendar': { 'url': 'https://p46-calendarws.icloud.com:443', 'status': 'active' },
    'docws': { 'pcsRequired': true, 'url': 'https://p46-docws.icloud.com:443', 'status': 'active' },
    'settings': { 'url': 'https://p46-settingsws.icloud.com:443', 'status': 'active' },
    'ubiquity': { 'url': 'https://p46-ubiquityws.icloud.com:443', 'status': 'active' },
    'streams': { 'url': 'https://p46-streams.icloud.com:443', 'status': 'active' },
    'keyvalue': { 'url': 'https://p46-keyvalueservice.icloud.com:443', 'status': 'active' },
    'ckdatabasews': { 'pcsRequired': true, 'url': 'https://p46-ckdatabasews.icloud.com:443', 'status': 'active' },
    'photosupload': { 'pcsRequired': true, 'url': 'https://p46-uploadphotosws.icloud.com:443', 'status': 'active' },
    'archivews': { 'url': 'https://p46-archivews.icloud.com:443', 'status': 'active' },
    'photos': {
      'pcsRequired': true,
      'uploadUrl': 'https://p46-uploadphotosws.icloud.com:443',
      'url': 'https://p46-photosws.icloud.com:443',
      'status': 'active',
    },
    'push': { 'url': 'https://p46-pushws.icloud.com:443', 'status': 'active' },
    'drivews': { 'pcsRequired': true, 'url': 'https://p46-drivews.icloud.com:443', 'status': 'active' },
    'uploadimagews': { 'url': 'https://p46-uploadimagews.icloud.com:443', 'status': 'active' },
    'iwmb': { 'url': 'https://p46-iwmb.icloud.com:443', 'status': 'active' },
    'schoolwork': {},
    'cksharews': { 'url': 'https://p46-ckshare.icloud.com:443', 'status': 'active' },
    'iworkexportws': { 'url': 'https://p46-iworkexportws.icloud.com:443', 'status': 'active' },
    'geows': { 'url': 'https://p46-geows.icloud.com:443', 'status': 'active' },
    'findme': { 'url': 'https://p46-fmipweb.icloud.com:443', 'status': 'active' },
    'ckdeviceservice': { 'url': 'https://p46-ckdevice.icloud.com:443' },
    'iworkthumbnailws': { 'url': 'https://p46-iworkthumbnailws.icloud.com:443', 'status': 'active' },
    'account': {
      'iCloudEnv': { 'shortId': 'p', 'vipSuffix': 'prod' },
      'url': 'https://p46-setup.icloud.com:443',
      'status': 'active',
    },
    'contacts': { 'url': 'https://p46-contactsws.icloud.com:443', 'status': 'active' },
  },
  'pcsEnabled': true,
  'configBag': {
    'urls': {
      'accountCreateUI':
        'https://appleid.apple.com/widget/account/?widgetKey=d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d#!create',
      'accountLoginUI':
        'https://idmsa.apple.com/appleauth/auth/signin?widgetKey=d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d',
      'accountLogin': 'https://setup.icloud.com/setup/ws/1/accountLogin',
      'accountRepairUI':
        'https://appleid.apple.com/widget/account/?widgetKey=d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d#!repair',
      'downloadICloudTerms': 'https://setup.icloud.com/setup/ws/1/downloadLiteTerms',
      'repairDone': 'https://setup.icloud.com/setup/ws/1/repairDone',
      'accountAuthorizeUI':
        'https://idmsa.apple.com/appleauth/auth/authorize/signin?client_id=d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d',
      'vettingUrlForEmail': 'https://id.apple.com/IDMSEmailVetting/vetShareEmail',
      'accountCreate': 'https://setup.icloud.com/setup/ws/1/createLiteAccount',
      'getICloudTerms': 'https://setup.icloud.com/setup/ws/1/getTerms',
      'vettingUrlForPhone': 'https://id.apple.com/IDMSEmailVetting/vetSharePhone',
    },
    'accountCreateEnabled': 'true',
  },
  'hsaTrustedBrowser': true,
  'appsOrder': [
    'mail',
    'contacts',
    'calendar',
    'photos',
    'iclouddrive',
    'notes3',
    'reminders',
    'pages',
    'numbers',
    'keynote',
    'newspublisher',
    'find',
    'settings',
  ],
  'version': 2,
  'isExtendedLogin': false,
  'pcsServiceIdentitiesIncluded': true,
  'hsaChallengeRequired': false,
  'requestInfo': { 'country': 'RU', 'timeZone': 'GMT+3' },
  'pcsDeleted': false,
  'iCloudInfo': { 'SafariBookmarksHasMigratedToCloudKit': true },
  'apps': {
    'calendar': {},
    'reminders': {},
    'keynote': { 'isQualifiedForBeta': true },
    'settings': { 'canLaunchWithOneFactor': true },
    'mail': { 'isCKMail': false },
    'numbers': { 'isQualifiedForBeta': true },
    'photos': {},
    'pages': { 'isQualifiedForBeta': true },
    'notes3': {},
    'find': { 'canLaunchWithOneFactor': true },
    'iclouddrive': {},
    'newspublisher': { 'isHidden': true },
    'contacts': {},
  },
}

export const retrieveHierarchy1 = {
  dateCreated: '2021-09-25T20:39:45Z',
  drivewsid: 'FOLDER::F3LWYJ7GM7.com.apple.mobilegarageband::documents',
  docwsid: 'documents',
  zone: 'F3LWYJ7GM7.com.apple.mobilegarageband',
  name: 'GarageBand for iOS',
  parentId: 'FOLDER::com.apple.CloudDocs::root',
  etag: '9',
  type: 'APP_LIBRARY',
  maxDepth: 'ANY',
  icons: [
    {
      url: 'https://p46-drivews.icloud.com/getIcons?id=F3LWYJ7GM7.com.apple.mobilegarageband&field=icon120x120_iOS',
      type: 'IOS',
      size: 120,
    },
    {
      url: 'https://p46-drivews.icloud.com/getIcons?id=F3LWYJ7GM7.com.apple.mobilegarageband&field=icon80x80_iOS',
      type: 'IOS',
      size: 80,
    },
    {
      url: 'https://p46-drivews.icloud.com/getIcons?id=F3LWYJ7GM7.com.apple.mobilegarageband&field=icon40x40_iOS',
      type: 'IOS',
      size: 40,
    },
  ],
  supportedExtensions: ['gbproj', 'band'],
  supportedTypes: ['com.apple.garageband.project'],
  items: [
    {
      drivewsid: 'FILE::F3LWYJ7GM7.com.apple.mobilegarageband::2FBEE2CE-8FCA-4397-A99A-8E7949162AAF',
      docwsid: '2FBEE2CE-8FCA-4397-A99A-8E7949162AAF',
      etag: '7::6',
    },
  ],
  numberOfItems: 1,
  status: 'OK',
  hierarchy: [{ drivewsid: 'FOLDER::com.apple.CloudDocs::root' }],
}