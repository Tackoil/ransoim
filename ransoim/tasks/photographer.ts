import axios from 'axios';
import { Logger } from 'mirai-ts';
import { Collection } from "mongodb";
import { TaskHelper } from "..";
import { Task } from "./task";

const logger = new Logger({ prefix: "[ransoim-photographer]" })

const MB15 = 15000000;

export class Photographer implements Task {
    _collection: Collection;
    trigger: any = "message";
    constructor(config = {}, helper: TaskHelper) {
        this._collection = helper.getCollection('pictures');
    }
    async _saveImage(imageId: string, base64: string, url: string) {
        const count = await this._collection.count({ imageId });
        if (!count) {
            await this._collection.insertOne({ imageId, base64, url });
        }
    }
    async _findImage(imageId: string) {
        const count = await this._collection.count({ imageId });
        return count > 0;
    }
    handler(msg: any) {
        if (!msg || !msg.messageChain) return;
        msg.messageChain.forEach(async (message: any) => {
            if (message.type === 'Image') {
                const imageId = message.imageId;
                const url = message.url;
                if (! await this._findImage(imageId)) {
                    try{
                        const res = await axios.get(url, { responseType: 'arraybuffer' });
                        // console.log(res.headers)
			            if(parseInt(res.headers['content-length']) < MB15){
                            const base64 = res.data.toString('base64');
                            this._saveImage(imageId, base64, url);
                        } else {
                            logger.error(`${imageId} Exceed the size of MongoDB limit.`)
                        }
                    } catch {
                        logger.error(`${url} return by 404`)
                    }
                }
            }
        })
    }
}
