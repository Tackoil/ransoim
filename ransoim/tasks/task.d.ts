export interface Task{
    trigger: "message",
    handler: (msg: any) => void;
}