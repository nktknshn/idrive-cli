/* import { ICloudSessionValidated } from "../icloud/authorization/authorize"
import { ICloudDriveCache } from "../icloud/drive/cache"
import * as Cache from '../icloud/drive/cache';
import { parsePath } from "../icloud/drive/helpers";
import Path from 'path'
import { pipe } from "fp-ts/lib/function";
import * as TE from 'fp-ts/lib/TaskEither'

const getParentDir = (path: string) => {
    return Path.parse(path).dir
}
/* 
export class ICloudDrive {
    session: ICloudSessionValidated
    cache: ICloudDriveCache
    
    constructor(
        session: ICloudSessionValidated,
        cache: ICloudDriveCache = Cache.cache()
    ) {
        this.session = session
        this.cache = cache
    }

    public getPath(
        path: string
    ) {
        pipe(
            getUnixPath(this.cache, this.session, parsePath(getParentDir(path))),
            
        )
    }

    private setCache(
        cache: ICloudDriveCache
    ) {
        this.cache = cache
    }
    
    private setSesssion(
        session: ICloudSessionValidated
    ) {
        this.session = session
    }

} */