var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  Config: () => Config,
  apply: () => apply,
  inject: () => inject,
  name: () => name,
  usage: () => usage
});
module.exports = __toCommonJS(src_exports);
var import_koishi = require("koishi");
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");
var import_node_util = require("node:util");
var name = "image-selecter";
var inject = {
  required: ["http", "logger"]
};
var usage = `
---

<a target="_blank" href="https://www.npmjs.com/package/koishi-plugin-image-selecter">点击查看使用方法</a>

---
`;
var Config = import_koishi.Schema.intersect([
  import_koishi.Schema.object({
    saveCommandName: import_koishi.Schema.string().default("存图").description("存图指令名称"),
    tempPath: import_koishi.Schema.string().required().description("临时存储路径").role("textarea", { rows: [2, 4] }),
    promptTimeout: import_koishi.Schema.number().default(30).description("等待用户发送图片的超时时间(秒)")
  }).description("存图功能"),
  import_koishi.Schema.object({
    imagePath: import_koishi.Schema.string().required().description("图片库路径").role("textarea", { rows: [2, 4] }),
    filenameTemplate: import_koishi.Schema.string().role("textarea", { rows: [2, 4] }).default("${date}-${time}-${index}-${guildId}-${userId}${ext}").description("文件名模板，支持变量: ${userId}, ${username}, ${timestamp}, ${date}, ${time}, ${index}, ${ext}, ${guildId}, ${channelId}")
  }).description("发图功能"),
  import_koishi.Schema.object({
    debugMode: import_koishi.Schema.boolean().default(false).description("启用调试日志模式").experimental()
  }).description("调试模式")
]);
function apply(ctx, config) {
  const formatLogLine = /* @__PURE__ */ __name((selfId, args) => {
    const content = args.map((arg) => {
      if (typeof arg === "string") return arg;
      if (arg instanceof Error) return arg.stack || arg.message;
      return (0, import_node_util.inspect)(arg, { depth: null, compact: true, breakLength: Infinity });
    }).join(" ");
    return selfId ? `[${selfId}] ${content}` : content;
  }, "formatLogLine");
  const loginfo = /* @__PURE__ */ __name((selfId, ...args) => {
    if (config.debugMode) {
      ctx.logger.info(formatLogLine(selfId, args));
    }
  }, "loginfo");
  const logwarn = /* @__PURE__ */ __name((selfId, ...args) => {
    ctx.logger.warn(formatLogLine(selfId, args));
  }, "logwarn");
  const isMediaElement = /* @__PURE__ */ __name((element) => {
    return ["img", "mface", "image", "video"].includes(element.type);
  }, "isMediaElement");
  const getFileExtension = /* @__PURE__ */ __name((selfId, file, mediaType) => {
    loginfo(selfId, "文件信息:", file);
    const mimeType = file.type || file.mime;
    let detectedExtension = "";
    if (mimeType === "image/jpeg") {
      detectedExtension = ".jpg";
    } else if (mimeType === "image/png") {
      detectedExtension = ".png";
    } else if (mimeType === "image/gif") {
      detectedExtension = ".gif";
    } else if (mimeType === "image/webp") {
      detectedExtension = ".webp";
    } else if (mimeType === "image/bmp") {
      detectedExtension = ".bmp";
    } else if (mimeType === "video/mp4") {
      detectedExtension = ".mp4";
    } else if (mimeType === "video/quicktime") {
      detectedExtension = ".mov";
    } else if (mimeType === "video/x-msvideo") {
      detectedExtension = ".avi";
    } else if (mimeType) {
      loginfo(selfId, `未知的文件类型，file.type=${file.type}, file.mime=${file.mime}`);
      detectedExtension = mediaType === "video" ? ".mp4" : ".jpg";
    } else {
      loginfo(selfId, `无法检测到文件类型，file.type=${file.type}, file.mime=${file.mime}`);
      detectedExtension = mediaType === "video" ? ".mp4" : ".jpg";
    }
    loginfo(selfId, "检测到的文件扩展名:", detectedExtension);
    return detectedExtension;
  }, "getFileExtension");
  const getMimeTypeByFilename = /* @__PURE__ */ __name((filename) => {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    if (ext === "png") return "image/png";
    if (ext === "gif") return "image/gif";
    if (ext === "webp") return "image/webp";
    if (ext === "bmp") return "image/bmp";
    if (ext === "tif" || ext === "tiff") return "image/tiff";
    if (ext === "mp4") return "video/mp4";
    if (ext === "mov") return "video/quicktime";
    if (ext === "avi") return "video/x-msvideo";
    return "";
  }, "getMimeTypeByFilename");
  const readFolderMatches = /* @__PURE__ */ __name(async (selfId, rootPath, input) => {
    try {
      const folders = await import_node_fs.promises.readdir(rootPath, { withFileTypes: true });
      return folders.filter((folder) => folder.isDirectory()).map((folder) => folder.name).filter((folderName) => folderName.split("-").includes(input));
    } catch (error) {
      loginfo(selfId, `扫描目录失败: ${rootPath}`, error);
      return [];
    }
  }, "readFolderMatches");
  const resolveFolderByAlias = /* @__PURE__ */ __name(async (selfId, input, rootPaths) => {
    for (const rootPath of rootPaths) {
      const matchedFolders = await readFolderMatches(selfId, rootPath, input);
      if (matchedFolders.length === 0) {
        continue;
      }
      if (matchedFolders.length > 1) {
        logwarn(selfId, `检测到别名重名: 输入"${input}"匹配到 ${matchedFolders.length} 个文件夹: ${matchedFolders.join(", ")}`);
      }
      const folderName = matchedFolders[Math.floor(Math.random() * matchedFolders.length)];
      return {
        rootPath,
        folderName,
        folderPath: (0, import_node_path.join)(rootPath, folderName)
      };
    }
    return null;
  }, "resolveFolderByAlias");
  const parseMediaElements = /* @__PURE__ */ __name((content) => {
    return import_koishi.h.parse(content).filter((element) => isMediaElement(element));
  }, "parseMediaElements");
  ctx.command(`${config.saveCommandName} [角色名称] [...图片]`, { captureQuote: false }).userFields(["id", "name", "authority"]).action(async ({ session }, roleName, ...images) => {
    if (session.quote) {
      loginfo(session.selfId, "检测到引用消息，尝试从引用消息中提取图片");
      const quoteImages = parseMediaElements(session.quote.content);
      if (quoteImages.length > 0) {
        loginfo(session.selfId, "从引用消息中找到图片:", quoteImages.length, "个");
        images = [session.quote.content];
      }
    }
    if (images.length === 0) {
      await session.send("请发送图片或视频");
      const promptResult = await session.prompt(config.promptTimeout * 1e3);
      if (!promptResult) {
        return "未收到图片或视频";
      }
      images = [promptResult];
    }
    const allImages = [];
    for (const imageItem of images) {
      allImages.push(...parseMediaElements(imageItem));
    }
    if (allImages.length === 0) {
      return "请发送有效的图片或视频";
    }
    try {
      let targetPath = config.tempPath;
      let folderName = "";
      if (roleName) {
        const matchedFolder = await resolveFolderByAlias(session.selfId, roleName, [config.tempPath]);
        if (!matchedFolder) {
          return `未找到角色"${roleName}"对应的文件夹，请检查角色名称或别名是否正确，或者该角色尚未收录`;
        }
        folderName = matchedFolder.folderName;
        targetPath = (0, import_node_path.join)(config.tempPath, folderName);
        loginfo(session.selfId, "使用匹配到的角色文件夹:", matchedFolder.folderPath);
      }
      await import_node_fs.promises.mkdir(targetPath, { recursive: true });
      const baseTimestamp = Date.now();
      let savedCount = 0;
      for (let i = 0; i < allImages.length; i++) {
        const img = allImages[i];
        const url = img.attrs.src || img.attrs.url;
        if (!url) {
          continue;
        }
        const file = await ctx.http.file(url);
        if (!file || !file.data) {
          loginfo(session.selfId, "无法获取文件数据:", url);
          continue;
        }
        const buffer = Buffer.from(file.data);
        const ext = getFileExtension(session.selfId, file, img.type);
        const timestamp = baseTimestamp + i;
        const now = new Date(timestamp);
        const date = now.toISOString().split("T")[0];
        const time = now.toTimeString().split(" ")[0].replace(/:/g, "-");
        let filename = config.filenameTemplate.replace(/\$\{userId\}/g, session.userId || "unknown").replace(/\$\{username\}/g, session.username || "unknown").replace(/\$\{timestamp\}/g, timestamp.toString()).replace(/\$\{date\}/g, date).replace(/\$\{time\}/g, time).replace(/\$\{index\}/g, (i + 1).toString()).replace(/\$\{ext\}/g, ext).replace(/\$\{guildId\}/g, session.guildId || "private").replace(/\$\{channelId\}/g, session.channelId || "unknown");
        filename = filename.replace(/[\u0000-\u001f\u007f-\u009f\/\\:*?"<>|]/g, "_");
        const filepath = (0, import_node_path.join)(targetPath, filename);
        await import_node_fs.promises.writeFile(filepath, buffer);
        savedCount++;
        loginfo(session.selfId, `保存文件 ${i + 1}/${allImages.length}:`, filename);
      }
      return roleName ? `已保存${savedCount} 个文件到"${roleName}"文件夹` : `已保存${savedCount} 个文件到临时文件夹`;
    } catch (error) {
      return `保存失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  });
  ctx.middleware(async (session, next) => {
    const input = session.stripped.content.trim();
    if (!input) {
      return next();
    }
    try {
      const matchedFolder = await resolveFolderByAlias(session.selfId, input, [config.imagePath]);
      if (!matchedFolder) {
        return next();
      }
      const files = await import_node_fs.promises.readdir(matchedFolder.folderPath);
      const mediaFiles = files.filter((file) => /\.(jpe?g|png|gif|webp|mp4|mov|avi|bmp|tiff?)$/i.test(file));
      if (mediaFiles.length === 0) {
        return "该文件夹暂无图片或视频";
      }
      const randomFile = mediaFiles[Math.floor(Math.random() * mediaFiles.length)];
      const filePath = (0, import_node_path.join)(matchedFolder.folderPath, randomFile);
      loginfo(session.selfId, `输入"${input}"命中目录: [ '${matchedFolder.folderName}' ] 根目录: ${matchedFolder.rootPath} 随机选中文件夹: ${matchedFolder.folderPath} 随机选中文件: ${randomFile}`);
      const isVideo = /\.(mp4|mov|avi)$/i.test(randomFile);
      const fileBuffer = await import_node_fs.promises.readFile(filePath);
      const mimeType = getMimeTypeByFilename(randomFile);
      await session.send(
        isVideo ? import_koishi.h.video(fileBuffer, mimeType || "video/mp4") : import_koishi.h.image(fileBuffer, mimeType || "image/jpeg")
      );
    } catch (error) {
      loginfo("发图失败:", error);
    }
    return next();
  }, true);
}
__name(apply, "apply");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Config,
  apply,
  inject,
  name,
  usage
});
