import { Context, Schema, h } from 'koishi'

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { inspect } from 'node:util'

export const name = 'image-selecter'
export const inject = {
  required: ['http', 'logger'],
}

export const usage = `
---

<a target="_blank" href="https://www.npmjs.com/package/koishi-plugin-image-selecter">点击查看使用方法</a>

---
`

export interface Config {
  tempPath: string
  imagePath: string
  promptTimeout: number
  filenameTemplate: string
  debugMode: boolean
  saveCommandName: string
}

type HttpFile = {
  type?: string
  mime?: string
  data?: ArrayBuffer | ArrayBufferView | string | Buffer
}

type MediaElement = {
  type: string
  attrs: {
    src?: string
    url?: string
  }
}

type FolderMatch = {
  rootPath: string
  folderName: string
  folderPath: string
}

type FolderCacheState = {
  loaded: boolean
  folderNames: string[]
  folderNameSet: Set<string>
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    saveCommandName: Schema.string().default('存图').description('存图指令名称'),
    tempPath: Schema.string().required().description('临时存储路径').role('textarea', { rows: [2, 4] }),
    promptTimeout: Schema.number().default(30).description('等待用户发送图片的超时时间(秒)'),
  }).description('存图功能'),
  Schema.object({
    imagePath: Schema.string().required().description('图片库路径').role('textarea', { rows: [2, 4] }),
    filenameTemplate: Schema.string()
      .role('textarea', { rows: [2, 4] })
      .default('${date}-${time}-${index}-${guildId}-${userId}${ext}')
      .description('文件名模板，支持变量: ${userId}, ${username}, ${timestamp}, ${date}, ${time}, ${index}, ${ext}, ${guildId}, ${channelId}'),
  }).description('发图功能'),
  Schema.object({
    debugMode: Schema.boolean().default(false).description('启用调试日志模式').experimental(),
  }).description('调试模式'),
])

export function apply(ctx: Context, config: Config) {
  const folderCaches = new Map<string, FolderCacheState>()

  const formatLogLine = (selfId: string | undefined, args: unknown[]) => {
    const content = args
      .map((arg) => {
        if (typeof arg === 'string') return arg
        if (arg instanceof Error) return arg.stack || arg.message
        return inspect(arg, { depth: null, compact: true, breakLength: Infinity })
      })
      .join(' ')

    return selfId ? `[${selfId}] ${content}` : content
  }

  const loginfo = (selfId: string | undefined, ...args: unknown[]) => {
    if (config.debugMode) {
      ctx.logger.info(formatLogLine(selfId, args))
    }
  }

  const logwarn = (selfId: string | undefined, ...args: unknown[]) => {
    ctx.logger.warn(formatLogLine(selfId, args))
  }

  const isMediaElement = (element: { type?: string }) => {
    return !!element.type && ['img', 'mface', 'image', 'video'].includes(element.type)
  }

  const getFileExtension = (selfId: string | undefined, file: HttpFile, mediaType: string) => {
    loginfo(selfId, '文件信息:', file)

    const mimeType = file.type || file.mime

    if (mimeType === 'image/jpeg') return '.jpg'
    if (mimeType === 'image/png') return '.png'
    if (mimeType === 'image/gif') return '.gif'
    if (mimeType === 'image/webp') return '.webp'
    if (mimeType === 'image/bmp') return '.bmp'
    if (mimeType === 'video/mp4') return '.mp4'
    if (mimeType === 'video/quicktime') return '.mov'
    if (mimeType === 'video/x-msvideo') return '.avi'

    if (mimeType) {
      loginfo(selfId, `未知的文件类型，file.type=${file.type}, file.mime=${file.mime}`)
    } else {
      loginfo(selfId, `无法检测到文件类型，file.type=${file.type}, file.mime=${file.mime}`)
    }

    const fallback = mediaType === 'video' ? '.mp4' : '.jpg'
    loginfo(selfId, '检测到的文件扩展名:', fallback)
    return fallback
  }

  const getMimeTypeByFilename = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase()
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
    if (ext === 'png') return 'image/png'
    if (ext === 'gif') return 'image/gif'
    if (ext === 'webp') return 'image/webp'
    if (ext === 'bmp') return 'image/bmp'
    if (ext === 'tif' || ext === 'tiff') return 'image/tiff'
    if (ext === 'mp4') return 'video/mp4'
    if (ext === 'mov') return 'video/quicktime'
    if (ext === 'avi') return 'video/x-msvideo'
    return ''
  }

  const getFolderCache = (rootPath: string) => {
    let cache = folderCaches.get(rootPath)
    if (!cache) {
      cache = {
        loaded: false,
        folderNames: [],
        folderNameSet: new Set(),
      }
      folderCaches.set(rootPath, cache)
    }
    return cache
  }

  const refreshFolderCache = async (selfId: string | undefined, rootPath: string) => {
    try {
      const folders = await fs.readdir(rootPath, { withFileTypes: true })
      const folderNames = folders
        .filter((folder) => folder.isDirectory())
        .map((folder) => folder.name)

      const cache = getFolderCache(rootPath)
      cache.folderNames = folderNames
      cache.folderNameSet = new Set(folderNames)
      cache.loaded = true

      loginfo(selfId, `目录缓存已更新: ${rootPath} 共 ${folderNames.length} 个文件夹`)
      return cache
    } catch (error) {
      loginfo(selfId, `扫描目录失败: ${rootPath}`, error)
      const cache = getFolderCache(rootPath)
      cache.loaded = true
      return cache
    }
  }

  const ensureFolderCache = async (selfId: string | undefined, rootPath: string) => {
    const cache = getFolderCache(rootPath)
    if (!cache.loaded) {
      await refreshFolderCache(selfId, rootPath)
    }
    return cache
  }

  const touchFolderCache = (rootPath: string, folderName: string) => {
    const cache = getFolderCache(rootPath)
    if (!cache.folderNameSet.has(folderName)) {
      cache.folderNameSet.add(folderName)
      cache.folderNames.push(folderName)
    }
    cache.loaded = true
  }

  const readFolderMatches = async (selfId: string | undefined, rootPath: string, input: string) => {
    await ensureFolderCache(selfId, rootPath)
    const cache = getFolderCache(rootPath)
    return cache.folderNames.filter((folderName) => folderName.split('-').includes(input))
  }

  const resolveFolderByAlias = async (
    selfId: string | undefined,
    input: string,
    rootPaths: string[],
  ): Promise<FolderMatch | null> => {
    for (const rootPath of rootPaths) {
      const matchedFolders = await readFolderMatches(selfId, rootPath, input)
      if (matchedFolders.length === 0) continue

      if (matchedFolders.length > 1) {
        logwarn(selfId, `检测到别名重名: 输入"${input}"匹配到 ${matchedFolders.length} 个文件夹: ${matchedFolders.join(', ')}`)
      }

      const folderName = matchedFolders[Math.floor(Math.random() * matchedFolders.length)]
      return {
        rootPath,
        folderName,
        folderPath: join(rootPath, folderName),
      }
    }

    return null
  }

  const parseMediaElements = (content: string) => {
    return h.parse(content).filter((element) => isMediaElement(element))
  }

  // 启动时预热常用目录缓存，避免首条消息触发扫描
  void refreshFolderCache(undefined, config.imagePath)
  void refreshFolderCache(undefined, config.tempPath)

  // 存图命令
  ctx.command(`${config.saveCommandName} [角色名称] [...图片]`, { captureQuote: false })
    .userFields(['id', 'name', 'authority'])
    .action(async ({ session }, roleName, ...images) => {
      if (session.quote) {
        loginfo(session.selfId, '检测到引用消息，尝试从引用消息中提取图片')
        const quoteImages = parseMediaElements(session.quote.content)
        if (quoteImages.length > 0) {
          loginfo(session.selfId, '从引用消息中找到图片:', quoteImages.length, '个')
          images = [session.quote.content]
        }
      }

      if (images.length === 0) {
        await session.send('请发送图片或视频')
        const promptResult = await session.prompt(config.promptTimeout * 1000)
        if (!promptResult) return '未收到图片或视频'
        images = [promptResult]
      }

      const allImages: MediaElement[] = []
      for (const imageItem of images) {
        allImages.push(...parseMediaElements(imageItem))
      }

      if (allImages.length === 0) {
        return '请发送有效的图片或视频'
      }

      try {
        let targetPath = config.tempPath
        let folderName = ''

        if (roleName) {
          // 存图时只按图库目录确定标准文件夹名
          const matchedFolder = await resolveFolderByAlias(session.selfId, roleName, [config.imagePath])
          if (!matchedFolder) {
            return `未找到角色"${roleName}"对应的文件夹，请检查角色名称或别名是否正确，或者该角色尚未收录`
          }

          folderName = matchedFolder.folderName
          targetPath = join(config.tempPath, folderName)
          loginfo(session.selfId, `存图使用标准目录: ${matchedFolder.folderPath} -> ${targetPath}`)
        }

        await fs.mkdir(targetPath, { recursive: true })
        if (folderName) {
          touchFolderCache(config.tempPath, folderName)
        }

        const baseTimestamp = Date.now()
        let savedCount = 0

        for (let i = 0; i < allImages.length; i++) {
          const img = allImages[i]
          const url = img.attrs.src || img.attrs.url
          if (!url) continue

          const file = await ctx.http.file(url)
          if (!file || !file.data) {
            loginfo(session.selfId, '无法获取文件数据:', url)
            continue
          }

          const buffer = Buffer.from(file.data)
          const ext = getFileExtension(session.selfId, file, img.type)

          const timestamp = baseTimestamp + i
          const now = new Date(timestamp)
          const date = now.toISOString().split('T')[0]
          const time = now.toTimeString().split(' ')[0].replace(/:/g, '-')

          let filename = config.filenameTemplate
            .replace(/\$\{userId\}/g, session.userId || 'unknown')
            .replace(/\$\{username\}/g, session.username || 'unknown')
            .replace(/\$\{timestamp\}/g, String(timestamp))
            .replace(/\$\{date\}/g, date)
            .replace(/\$\{time\}/g, time)
            .replace(/\$\{index\}/g, String(i + 1))
            .replace(/\$\{ext\}/g, ext)
            .replace(/\$\{guildId\}/g, session.guildId || 'private')
            .replace(/\$\{channelId\}/g, session.channelId || 'unknown')

          filename = filename.replace(/[\u0000-\u001f\u007f-\u009f\/\\:*?"<>|]/g, '_')

          await fs.writeFile(join(targetPath, filename), buffer)
          savedCount++

          loginfo(session.selfId, `保存文件 ${i + 1}/${allImages.length}:`, filename)
        }

        return roleName
          ? `已保存${savedCount} 个文件到"${folderName}"文件夹`
          : `已保存${savedCount} 个文件到临时文件夹`
      } catch (error) {
        return `保存失败: ${error instanceof Error ? error.message : String(error)}`
      }
    })

  // 发图中间件
  ctx.middleware(async (session, next) => {
    const input = session.stripped.content.trim()
    if (!input) return next()

    try {
      // 发图只从图库目录读取，避免把待审核目录里的文件提前发出去
      const matchedFolder = await resolveFolderByAlias(session.selfId, input, [config.imagePath])
      if (!matchedFolder) return next()

      const files = await fs.readdir(matchedFolder.folderPath)
      const mediaFiles = files.filter((file) => /\.(jpe?g|png|gif|webp|mp4|mov|avi|bmp|tiff?)$/i.test(file))
      if (mediaFiles.length === 0) {
        return '该文件夹暂无图片或视频'
      }

      const randomFile = mediaFiles[Math.floor(Math.random() * mediaFiles.length)]
      const filePath = join(matchedFolder.folderPath, randomFile)

      loginfo(
        session.selfId,
        `输入"${input}"命中目录: [ '${matchedFolder.folderName}' ] 根目录: ${matchedFolder.rootPath} 随机选中文件夹: ${matchedFolder.folderPath} 随机选中文件: ${randomFile}`,
      )

      const fileBuffer = await fs.readFile(filePath)
      const mimeType = getMimeTypeByFilename(randomFile)
      const isVideo = /\.(mp4|mov|avi)$/i.test(randomFile)

      // 直接发送二进制，避免 QQ 适配器把本地路径当成远程资源 fetch
      await session.send(
        isVideo
          ? h.video(fileBuffer, mimeType || 'video/mp4')
          : h.image(fileBuffer, mimeType || 'image/jpeg'),
      )
    } catch (error) {
      loginfo(session.selfId, '发图失败:', error)
    }

    return next()
  }, true)
}
