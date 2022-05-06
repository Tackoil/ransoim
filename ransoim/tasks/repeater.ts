import { Logger } from 'mirai-ts';
import _ from 'lodash';
import { createHash } from 'crypto'
import type { Task } from './task';
import { getDate, messageSummary, TimeCache } from '../utils';
import { TaskHelper } from '..';

const logger = new Logger({ prefix: "[ransoim-repeater]" })

// Typing 
type RepeaterConfig = {
    // Repeatable Message: Time Slide Window (TF mode)
    timeWindow: number,
    repeatFreq: number,
    // Plus F mode
    repeatCount: number,

    // Repeat Behavior: Negative Exponential Function (Q mode)
    repeatBehaviorQ: number,

    // Repeat Delay Behavior: TBD
    avgDelayTime: number,

    // Frozen Method: TBD
    frozenTime: number,

    // Acceptable Configs
    acceptGroup: number[],
    groupConfig: {
        [x: number]: {
            exceptSenders: number[],
            exceptTypes: string[],
            exceptWords: string[]
        }
    }
}

type MessageWithHashTime = {
    hash: string,
    timestamp: number,
    msg: any[],
}

const defaultConfig: RepeaterConfig = {
    timeWindow: 140,
    repeatFreq: 3,
    repeatCount: 3,

    repeatBehaviorQ: 0.8624,

    avgDelayTime: 5,

    frozenTime: 5,

    acceptGroup: [],
    groupConfig: {},
}

export class Repeater implements Task {
    _helper: TaskHelper;
    _config: typeof defaultConfig;

    _cache: Map<number, TimeCache<MessageWithHashTime>>;
    _repeaterBox: Map<number, Set<string>>;
    _frozenList: Map<string, ReturnType<typeof setTimeout>>;

    trigger: any = "message";

    constructor(config: RepeaterConfig, helper: TaskHelper) {
        this._helper = helper;
        this._config = _.merge(defaultConfig, config);
        this._frozenList = new Map<string, ReturnType<typeof setTimeout>>();

        // initial groupConfig
        this._config.acceptGroup.forEach((groupId: number) => {
            this._config.groupConfig[groupId] = _.merge({
                exceptSenders: [],
                exceptTypes: [],
                exceptWords: []
            }, this._config.groupConfig[groupId]);
        })
        logger.info("===========================")
        logger.info(JSON.stringify(this._config))
        logger.info("===========================")

        // initial caches & repeater boxes
        this._cache = new Map<number, TimeCache<MessageWithHashTime>>();
        this._repeaterBox = new Map<number, Set<string>>();
        this._config.acceptGroup.forEach(groupid => {
            this._cache.set(groupid, new TimeCache<MessageWithHashTime>(this._config.timeWindow));
            this._repeaterBox.set(groupid, new Set<string>());
        })

        this._frozenList = new Map<string, ReturnType<typeof setTimeout>>();

        this._loadRepeaterBox();
    }
    private async _loadRepeaterBox() {
        const collection = this._helper.getCollection('boxes');
        const initaled: number[] = [];
        await collection.find({ 'groupId': { '$in': this._config.acceptGroup } }).forEach((doc) => {
            initaled.push(doc.groupId);
            this._repeaterBox.set(doc.groupId, new Set(doc.box));
        });
        this._config.acceptGroup.forEach(groupId => {
            if (!initaled.includes(groupId)) {
                collection.insertOne({ groupId, box: [] })
            }
        })
    }
    private async _pushRepeaterBox(hash: string, msg: any[], groupId: number) {
        if (!(this._repeaterBox.get(groupId)!.has(hash))) {
            logger.info(`${hash.slice(0, 7)} ADD in ${groupId}'s box`);
            const boxCollection = this._helper.getCollection('boxes');
            await boxCollection.updateOne({ 'groupId': groupId }, { '$addToSet': { 'box': hash } });
            const msgCollection = this._helper.getCollection('messages');
            await msgCollection.insertOne({ hash, msg });
            this._repeaterBox.get(groupId)!.add(hash);
        } else {
            logger.info(`${hash.slice(0, 7)} ALREADY in ${groupId}'s box`);
        }
    }
    private _pushCache(hash: string, timestamp: number, msg: any[], groupId: number): number {
        if (msg.length) {
            const { count, freq } = this._cache.get(groupId)!.pushCache({ hash, msg, timestamp });
            if (freq >= this._config.repeatFreq || count >= this._config.repeatCount) {
                logger.info(`${hash.slice(0, 7)} Trigger by ${freq >= this._config.repeatFreq ? "FREQ" : "===="} ${count >= this._config.repeatCount ? "COUNT" : "====="}`)
                this._pushRepeaterBox(hash, msg, groupId);
            }
            return count;
        } else {
            return 0;
        }
    }
    private _repeatProbFunc(k: number, q: number): number {
        return 1 - Math.pow(q, k);
    }
    private async _randomSend(hash: string, count: number, groupId: number, summary: string) {
        if (this._repeaterBox.get(groupId)!.has(hash)) {
            if (this._isFronzen(hash, groupId)) {
                logger.error(`(${hash.slice(0, 7)}: ${summary}) is frozen.`)
                return false;
            }
            await new Promise((resolve) => {
                const delay = Math.floor(Math.random() * this._config.avgDelayTime * 2 * 1000);
                logger.debug(`hash: ${hash.slice(0, 7)}, delay: ${delay}`)
                setTimeout(resolve, delay);
            })
            const result = Math.random();
            const target = this._repeatProbFunc(count, this._config.repeatBehaviorQ);
            logger.debug(`hash: ${hash.slice(0, 7)}, judgement: ${result.toFixed(4)} < ${target.toFixed(4)} == ${result < target ? "SUCCESS" : "FAILED"}`);
            return result < target;

        } else {
            return false;
        }
    }
    private _genFreezeKey(hash: string, groupId: number): string {
        return `${hash}@${groupId}`;
    }
    private _unfrozen(key: string) {
        if (this._frozenList.has(key)) {
            clearTimeout(this._frozenList.get(key) as ReturnType<typeof setTimeout>);
            this._frozenList.delete(key);
        }
    }
    private _isFronzen(hash: string, groupId: number) {
        const key = this._genFreezeKey(hash, groupId);
        if (this._frozenList.has(key)) {
            clearTimeout(this._frozenList.get(key) as ReturnType<typeof setTimeout>);
            this._frozenList.set(key, setTimeout(this._unfrozen.bind(this, key), this._config.frozenTime * 60000));
            return true;
        } else {
            return false;
        }
    }
    private _fronzen(hash: string, groupId: number) {
        const key = this._genFreezeKey(hash, groupId);
        let result = false;
        if (this._frozenList.has(key)) {
            clearTimeout(this._frozenList.get(key) as ReturnType<typeof setTimeout>);
            result = true;
        }
        this._frozenList.set(key, setTimeout(this._unfrozen.bind(this, key), this._config.frozenTime * 60000));
        return result;
    }
    private _createMessageHash(msg: any[]) {
        const hash = createHash('sha256');
        hash.update(JSON.stringify(msg));
        return hash.digest('hex');
    }
    handler(msg: any) {
        //logger.info(msg)
        if (msg && msg.sender && msg.sender.group) {
            const groupId = msg.sender.group.id;
            if (this._config.acceptGroup.includes(groupId)) {
                const exceptSenders = this._config.groupConfig[groupId].exceptSenders;
                const exceptTypes = this._config.groupConfig[groupId].exceptTypes;
                const exceptWords = this._config.groupConfig[groupId].exceptWords;
                if (msg.plain.indexOf("QQ") !== -1) {
                    logger.info(`${msg.plain} is not suport`);
                    return;
                }
                if (exceptSenders.includes(msg.sender.id)) {
                    logger.info(`${msg.sender.id} in ${groupId}'s exceptSenders`);
                    return;
                }
                if (exceptTypes.some(type => !!msg.get(type))) {
                    logger.info(`TYPE in ${groupId}'s exceptTypes`);
                    return;
                }
                if (exceptWords.some(word => msg.plain.indexOf(word) !== -1)) {
                    logger.info(`${msg.plain} is in ${groupId}'s exceptWords`);
                    return;
                }
                // clean message
                const message = _.cloneDeep(msg.messageChain.slice(1));
                message.forEach((item: any, index: number) => {
                    if (item.type === 'Image') {
                        message[index].url = null;
                    }
                })
                const hash = this._createMessageHash(message);
                const timestamp = new Date().valueOf()
                const summary = messageSummary(message);
                logger.info(`====> ${getDate(timestamp)} groupId: ${groupId}, (${hash.slice(0, 7)}: ${summary})`);
                const count = this._pushCache(hash, timestamp, message, groupId);
                this._randomSend(hash, count, groupId, summary).then((couldSend) => {
                    if (couldSend) {
                        if (this._fronzen(hash, groupId)) {
                            logger.error(`(${hash.slice(0, 7)}: ${summary}) is frozen.`)
                            return
                        }
                        message.forEach(async (item: any, index: number) => {
                            if (item.type === 'Image') {
                                message[index].base64 = await this._helper.getImage(item);
                            }
                        })
                        this._helper.getMiraiApi().sendGroupMessage(message, groupId).then(() => {
                            logger.success(`<==== ${getDate(timestamp)} groupId: ${groupId}, (${hash.slice(0, 7)}: ${summary})`);
                        }, (err) => {
                            logger.error(err);
                        })
                    }
                })
            }
        }
    }
}
