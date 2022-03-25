import { hideBin } from 'yargs/helpers'
import yargs from 'yargs/yargs'
import { defaultSessionFile } from '../../defaults'

export function parseArgs() {
  return yargs(hideBin(process.argv))
    .options({
      sessionFile: { alias: ['s', 'session'], default: defaultSessionFile },
      raw: { alias: 'r', default: false, type: 'boolean' },
      debug: { alias: 'd', default: false, type: 'boolean' },
    })
    .command('retrieveHierarchy [drivewsids..]', 'get h for drivewsids', _ =>
      _
        .positional('drivewsids', { type: 'string', array: true, demandOption: true })
        .options({}))
    .command('retrieveItemDetails [drivewsids..]', 'get h for drivewsids', _ =>
      _
        .positional('drivewsids', { type: 'string', array: true, demandOption: true })
        .options({}))
    .command('retrieveItemDetailsInFolders [drivewsids..]', 'get h for drivewsids', _ =>
      _
        .positional('drivewsids', { type: 'string', array: true, demandOption: true })
        .options({
          h: { type: 'boolean', default: false },
        }))
    .command('retrieveTrashDetails', 'retrieveTrashDetails', _ => _ // .positional('drivewsids', { type: 'string', array: true, demandOption: true })
      // .options({
      //   h: { type: 'boolean', default: false },
      // })
    )
    .command('rename [drivewsid] [name] [etag]', 'get h for drivewsids', _ =>
      _
        .positional('drivewsid', { type: 'string', demandOption: true })
        .positional('name', { type: 'string', demandOption: true })
        .positional('etag', { type: 'string', default: '12::34' /* demandOption: true */ })
        .options({}))
    .command('putBackItemsFromTrash [drivewsid] [etag]', 'putBackItemsFromTrash', _ =>
      _
        .positional('drivewsid', { type: 'string', demandOption: true })
        .positional('etag', { type: 'string', default: '12::34' /* demandOption: true */ })
        .options({}))
    .help()
}
