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
var name = "image-selecter";
var inject = {
  required: ["http", "logger"]
};
var usage = `
---

<a target="_blank" href="https://www.npmjs.com/package/koishi-plugin-image-selecter">➤ 食用方法点此获取</a>

---
`;
var Config = import_koishi.Schema.intersect([
  import_koishi.Schema.object({
    saveCommandName: import_koishi.Schema.string().default("存图").description("存图指令名称"),
    tempPath: import_koishi.Schema.string().required().description("临时存储路径").role("textarea", { rows: [2, 4] }),
    promptTimeout: import_koishi.Schema.number().default(30).description("等待用户发送图片的超时时间 (秒)")
  }).description("存图功能"),
  import_koishi.Schema.object({
    imagePath: import_koishi.Schema.string().required().description("图片库路径").role("textarea", { rows: [2, 4] }),
    filenameTemplate: import_koishi.Schema.string().role("textarea", { rows: [2, 4] }).default("${userId}-${channelId}-${date}-${index}${ext}").description("文件名模板，支持变量: ${userId}, ${username}, ${timestamp}, ${date}, ${time}, ${index}, ${ext}, ${guildId}, ${channelId}")
  }).description("发图功能"),
  import_koishi.Schema.object({
    debugMode: import_koishi.Schema.boolean().default(false).description("启用调试日志模式").experimental()
  }).description("调试模式")
]);
function apply(ctx, config) {
  function loginfo(...args) {
    if (config.debugMode) {
      ctx.logger.info(...args);
    }
  }
  __name(loginfo, "loginfo");
  const getFileExtension = /* @__PURE__ */ __name((file, imgType) => {
    loginfo("文件信息:", JSON.stringify(file, null, 2));
    let detectedExtension = "";
    const mimeType = file.type || file.mime;
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
      loginfo(`未知的文件类型，file.type=${file.type}, file.mime=${file.mime}`);
      detectedExtension = imgType === "video" ? ".mp4" : ".jpg";
    } else {
      loginfo(`无法检测到文件类型，file.type=${file.type}, file.mime=${file.mime}`);
      detectedExtension = imgType === "video" ? ".mp4" : ".jpg";
    }
    loginfo("检测到的文件扩展名:", detectedExtension);
    return detectedExtension;
  }, "getFileExtension");
  ctx.command(`${config.saveCommandName} [...图片]`, { captureQuote: false }).userFields(["id", "name", "authority"]).action(async ({ session }, ...图片) => {
    if (图片.length === 0 && session.quote) {
      loginfo("检测到引用消息，尝试从引用消息中提取图片");
      const quoteElements = import_koishi.h.parse(session.quote.content);
      const quoteImages = quoteElements.filter((el) => ["img", "mface", "image", "video"].includes(el.type));
      if (quoteImages.length > 0) {
        loginfo("从引用消息中找到图片:", quoteImages.length, "个");
        图片 = [session.quote.content];
      }
    }
    if (图片.length === 0) {
      await session.send("请发送图片或视频");
      const promptResult = await session.prompt(config.promptTimeout * 1e3);
      if (!promptResult) {
        return "未收到图片或视频";
      }
      图片 = [promptResult];
    }
    let allImages = [];
    for (const 图片Item of 图片) {
      const elements = import_koishi.h.parse(图片Item);
      const images = elements.filter((el) => ["img", "mface", "image", "video"].includes(el.type));
      allImages.push(...images);
    }
    if (allImages.length === 0) {
      return "请发送有效的图片或视频";
    }
    try {
      await import_node_fs.promises.mkdir(config.tempPath, { recursive: true });
      const baseTimestamp = Date.now();
      let savedCount = 0;
      for (let i = 0; i < allImages.length; i++) {
        const img = allImages[i];
        const url = img.attrs.src || img.attrs.url;
        if (!url) continue;
        const file = await ctx.http.file(url);
        if (!file || !file.data) {
          loginfo("无法获取文件数据:", url);
          continue;
        }
        const buffer = Buffer.from(file.data);
        const ext = getFileExtension(file, img.type);
        const timestamp = baseTimestamp + i;
        const now = new Date(timestamp);
        const date = now.toISOString().split("T")[0];
        const time = now.toTimeString().split(" ")[0].replace(/:/g, "-");
        let filename = config.filenameTemplate.replace(/\$\{userId\}/g, session.userId || "unknown").replace(/\$\{username\}/g, session.username || "unknown").replace(/\$\{timestamp\}/g, timestamp.toString()).replace(/\$\{date\}/g, date).replace(/\$\{time\}/g, time).replace(/\$\{index\}/g, (i + 1).toString()).replace(/\$\{ext\}/g, ext).replace(/\$\{guildId\}/g, session.guildId || "private").replace(/\$\{channelId\}/g, session.channelId || "unknown");
        filename = filename.replace(/[\u0000-\u001f\u007f-\u009f\/\\:*?"<>|]/g, "_");
        const filepath = (0, import_node_path.join)(config.tempPath, filename);
        await import_node_fs.promises.writeFile(filepath, buffer);
        savedCount++;
        loginfo(`保存文件 ${i + 1}/${allImages.length}:`, filename);
      }
      return `已保存 ${savedCount} 个文件到临时文件夹`;
    } catch (error) {
      return `保存失败: ${error.message}`;
    }
  });
  ctx.middleware(async (session, next) => {
    const input = session.stripped.content.trim();
    if (!input) return next();
    try {
      const folders = await import_node_fs.promises.readdir(config.imagePath, { withFileTypes: true });
      const matchedFolders = [];
      for (const folder of folders) {
        if (!folder.isDirectory()) continue;
        const folderName = folder.name;
        const aliases = folderName.split("-");
        if (aliases.includes(input)) {
          matchedFolders.push(folderName);
        }
      }
      if (matchedFolders.length === 0) {
        return next();
      }
      loginfo("匹配到的文件夹:", matchedFolders);
      if (matchedFolders.length > 1) {
        ctx.logger.warn(`检测到别名重名: 输入"${input}"匹配到${matchedFolders.length}个文件夹: ${matchedFolders.join(", ")}`);
      }
      const selectedFolder = matchedFolders[Math.floor(Math.random() * matchedFolders.length)];
      loginfo("随机选择文件夹:", selectedFolder);
      const folderPath = (0, import_node_path.join)(config.imagePath, selectedFolder);
      const files = await import_node_fs.promises.readdir(folderPath);
      const mediaFiles = files.filter(
        (file) => /\.(jpe?g|png|gif|webp|mp4|mov|avi|bmp|tiff?)$/i.test(file)
      );
      if (mediaFiles.length === 0) {
        return "该文件夹暂无图片或视频";
      }
      const randomFile = mediaFiles[Math.floor(Math.random() * mediaFiles.length)];
      const filePath = (0, import_node_path.join)(folderPath, randomFile);
      loginfo("随机选择文件:", randomFile);
      const isVideo = /\.(mp4|mov|avi)$/i.test(randomFile);
      const element = isVideo ? import_koishi.h.video(filePath) : import_koishi.h.image(filePath);
      await session.send(element);
      return next();
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
