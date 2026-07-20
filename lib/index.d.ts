import { Context, Schema } from 'koishi';
export declare const name = "image-selecter";
export declare const inject: {
    required: string[];
};
export declare const usage = "\n---\n\n<a target=\"_blank\" href=\"https://www.npmjs.com/package/koishi-plugin-image-selecter\">\u70B9\u51FB\u67E5\u770B\u4F7F\u7528\u65B9\u6CD5</a>\n\n---\n";
export interface Config {
    tempPath: string;
    imagePath: string;
    promptTimeout: number;
    filenameTemplate: string;
    debugMode: boolean;
    saveCommandName: string;
}
export declare const Config: Schema<Config>;
export declare function apply(ctx: Context, config: Config): void;
