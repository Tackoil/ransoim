import { Mirai } from "mirai-ts";
import type { MiraiApiHttpSetting } from "mirai-ts";
import { Db, MongoClient } from "mongodb";
import _ from "lodash";
import yaml from "js-yaml";
import fs from 'fs'

type Class<I, Args extends any[] = any[]> = new (...args: Args) => I;
type RansoimConfig = {
  miraiQQ: number,
  miraiConfig: MiraiApiHttpSetting,
  mongo: {
    url: string
  },
  tasks: { [x: string]: any; }
}

import { Task } from "./tasks/task";
import { getObjClassname } from "./utils"
import { Repeater } from "./tasks/repeater"
import { Recoder } from "./tasks/recorder";
import { Photographer } from "./tasks/photographer";

const defaultConfig: RansoimConfig = {
  miraiQQ: 123456,
  miraiConfig: {
    adapters: ["http", "ws"],
    enableVerify: true,
    verifyKey: "VERIFYKEY",
    singleMode: false,
    cacheSize: 4096,
    adapterSettings: {
      http: {
        host: "mcl",
        port: 8088,
        cors: ['*']
      },
      ws: {
        host: "mcl",
        port: 8088,
        reservedSyncId: "-1"
      }
    }
  } as MiraiApiHttpSetting,
  mongo: {
    url: "mongodb://localhost:27017"
  },
  tasks: {}
}

const importConfig = yaml.load(fs.readFileSync('./config.yml', 'utf-8')) as RansoimConfig;
const config = _.merge(defaultConfig, importConfig);

const mirai = new Mirai(config.miraiConfig);

const taskList: Class<Task>[] = [Recoder, Photographer, Repeater]

export class TaskHelper {
  private _db: Db;
  private _mirai: Mirai;
  private _mongo: MongoClient;
  constructor(name: string, mirai: Mirai, mongo: MongoClient) {
    this._mongo = mongo;
    this._mirai = mirai;
    this._db = mongo.db(name);
  }
  getCollection(collectionName: string) {
    return this._db.collection(collectionName);
  }
  async getImage(imageId: string) : Promise<string> {
    const db = this._mongo.db('PictureHolder');
    const holder = db.collection('pictures');
    const doc = await holder.findOne({ 'imageId': imageId });
    return doc?.base64 ?? '';
  }
  getMiraiApi() {
    return this._mirai.api;
  }
}

function loadTask(mirai: Mirai, mongo: MongoClient, config: typeof defaultConfig, TaskClass: Class<Task>) {
  const className = getObjClassname(TaskClass);
  const helper = new TaskHelper(className, mirai, mongo);
  const taskObj = new TaskClass(config.tasks[className] ?? {}, helper);
  mirai.on(taskObj.trigger, taskObj.handler.bind(taskObj));
}

async function app(config: typeof defaultConfig) {
  console.log("==========================================");
  console.log(JSON.stringify(config));
  console.log("==========================================");
  const mongoClient = new MongoClient(config.mongo.url);
  try {
    await mirai.link(config.miraiQQ);
    await mongoClient.connect();
    console.log("Loading tasks");
    taskList.forEach(task => loadTask(mirai, mongoClient, config, task));
    console.log("Listening message");
    mirai.listen();
  } catch {
    console.error("Connection Failed. Retry in 5 seconds.");
    setTimeout(() => { app(config) }, 5000)
  }
}

app(config);

