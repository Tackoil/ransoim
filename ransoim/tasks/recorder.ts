import Mirai from "mirai-ts";
import { Db } from "mongodb";
import { TaskHelper } from "..";
import type { Task } from "./task";

export class Recoder implements Task {
    _helper: TaskHelper
    trigger: any = "message";
    constructor(config = {}, helper: TaskHelper) {
        this._helper = helper;
        this.trigger = "message"
    }
    handler(msg: any) {
        if (!msg) return;
        const timestamp = new Date().getTime();
        if (msg.type === "FriendMessage") {
            const collection = this._helper.getCollection(`Friend-${msg.sender.id}`)
            collection.insertOne({ timestamp, msg });
        } else if (msg.type === "GroupMessage") {
            const collection = this._helper.getCollection(`Group-${msg.sender.group.id}`)
            collection.insertOne({ timestamp, msg });
        }
    }
}