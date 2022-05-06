import _ from "lodash";

export function getObjClassname(obj: Function): string {
    return obj.name;
}

interface WithHash {
    hash: string,
}

interface CacheItem extends WithHash {
    priority: number,
}
export class LRUCache<T extends WithHash>{
    private _name: string;
    private _size: number;
    private _cacheMap: Map<string, CacheItem>;
    private _cacheArray: Array<string>;
    constructor(size = 100, name = "") {
        this._name = name;
        this._size = size;
        this._cacheArray = [];
        this._cacheMap = new Map<string, CacheItem>();
    }

    private _cleanExceedCache() {
        if (this._cacheArray.length > this._size) {
            this._cacheArray.splice(this._size).forEach((hash: string) => {
                this._cacheMap.delete(hash);
            })
        }
    }

    private _replaceCache(hash: string) {
        const cacheIndex = this._cacheArray.indexOf(hash);
        if (cacheIndex !== -1) {
            this._cacheArray.splice(cacheIndex, 1);
        }
        this._cacheArray.unshift(hash);
        this._cleanExceedCache();
        if (this._cacheArray.length > this._size) {
            console.log("[LRUCache]: ", "SIZE ERROR", this._cacheArray);
        }
        // console.log("[LRUCache]: ", "input hash:", hash.slice(0, 7), '->', this._name, "cache list", Array.from(this._cacheArray.map(h => h.slice(0, 7))));
    }

    hitCache(cache: T): number {
        const hash = cache.hash;
        if (this._cacheMap.has(hash)) {
            this._cacheMap.get(hash)!.priority++;
        } else {
            this._cacheMap.set(hash, { priority: 1, ...cache })
        }
        this._replaceCache(hash);
        return this.getCachePriority(hash);
    }

    removeCache(hash: string): T | null {
        const cacheIndex = this._cacheArray.indexOf(hash);
        if (cacheIndex !== -1) {
            const result = this._cacheMap.get(hash);
            this._cacheArray.splice(cacheIndex, 1);
            return _.omit(result, "priority") as T;
        }
        return null;
    }

    getCachePriority(hash: string): number {
        return this._cacheMap.get(hash)?.priority ?? 1;
    }
}

interface WithHashTime {
    hash: string,
    timestamp: number,
}
export class TimeCache<T extends WithHashTime> {
    private _cacheArray: Array<T>;
    private _cacheMap: Map<string, number>;
    private _prevCount: number;
    private _prevHash: string | null;
    private _timeWindowSize: number;

    constructor(window = 140) {
        this._cacheArray = [];
        this._cacheMap = new Map<string, number>();
        this._prevCount = 0;
        this._prevHash = null;
        this._timeWindowSize = window * 1000;
    }

    _updatePrevCount(hash: string) {
        if (hash == this._prevHash) {
            this._prevCount++;
        } else {
            this._prevCount = 1;
            this._prevHash = hash;
        }
        return this._prevCount;
    }

    _cleanCache(timestamp: number) {
        while (this._cacheArray.length > 0 && timestamp - this._cacheArray[0].timestamp > this._timeWindowSize) {
            const oldCacheHash = this._cacheArray.shift()!.hash;
            if (this._cacheMap.has(oldCacheHash)) {
                const oldCacheHashFreq = this._cacheMap.get(oldCacheHash);
                if (!oldCacheHashFreq || oldCacheHashFreq <= 1) {
                    this._cacheMap.delete(oldCacheHash);
                } else {
                    this._cacheMap.set(oldCacheHash, this._cacheMap.get(oldCacheHash)??1 - 1);
                }
            }
        }
    }

    pushCache(cache: T): {
        count: number,
        freq: number
    } {
        const ts = cache.timestamp;
        const hash = cache.hash;
        this._cacheArray.push(cache);
        if (this._cacheMap.has(hash)) {
            this._cacheMap.set(hash, (this._cacheMap.get(hash)??0) + 1)
        } else {
            this._cacheMap.set(hash, 1);
        }
        this._cleanCache(ts);
        return {
            count: this._updatePrevCount(hash),
            freq: this.getCacheFreq(hash)
        };
    }

    getCacheFreq(hash: string) : number {
        if (this._cacheMap.has(hash)) {
            return this._cacheMap.get(hash)??0;
        } else {
            return 0;
        }
    }
}


const msgTypeMap = new Map<string, (msg: any) => string>([
    ["App", (msg: any) => `[App]`],
    ["At", (msg: any) => `[At: ${msg.target}]`],
    ["AtAll", (msg: any) => `[AtAll: @全体成员]`],
    ["Face", (msg: any) => `[Face: ${msg.name}]`],
    ["File", (msg: any) => `[File: ${msg.name}]`],
    ["FlashImage", (msg: any) => `[FlashImage: ${msg.imageId}]`],
    ["Foward", (msg: any) => `[Foward: ${msg.summary}]`],
    ["Image", (msg: any) => `[Image: ${msg.imageId}]`],
    ["Json", (msg: any) => `[JSON]`],
    ["MiraiCode", (msg: any) => `[MiraiCode]`],
    ["Plain", (msg: any) => msg.text],
    ["Quote", (msg: any) => `[Quote]`],
    ["Source", (msg: any) => ""],
    ["Voice", (msg: any) => `[Voice]`],
    ["Xml", (msg: any) => "[XML]"],
]);
export function messageSummary(messageChain: any[]) {
    const summaryList = messageChain.map((msg: any) => {
        if (msgTypeMap.has(msg.type)) {
            return msgTypeMap.get(msg.type)!(msg);
        } else {
            return "";
        }
    });
    return summaryList.join('');
}

export function getDate(timetamp: number){
    let myDate = new Date(timetamp);  //获取js时间
    let year = myDate.getFullYear(); //获取年
    let month = myDate.getMonth() + 1;//获取月
    let date = myDate.getDate();//获取日
    let  h = myDate.getHours(); //获取小时数(0-23)
    let m = myDate.getMinutes(); //获取分钟数(0-59)
    let s = myDate.getSeconds();
    let now = year + '-' + conver(month) + "-" + conver(date) + " " + conver(h) + ':' + conver(m) + ":" + conver(s);
    return now
 }
 
 //日期时间处理
 function conver(s: number) {
    return s < 10 ? '0' + s : s;
 }

