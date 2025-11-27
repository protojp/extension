const fs = require('fs/promises')
const path = require('path')
const os = require('os')

const state = {
  running: false,
  ready: false,
}

const MIME_MAP = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
}

const log = (...args) => console.log('[SplitImages]', ...args)

const getMime = ext => MIME_MAP[ext.toLowerCase()] || 'image/png'

const buildTempPath = originalPath => {
  const ext = path.extname(originalPath) || '.png'
  const base = path.basename(originalPath, ext)
  const tmpDir = path.join(os.tmpdir(), 'eagle-split-images')
  const rightName = `${base}_right${ext}`
  const leftName = `${base}_left${ext}`
  return {
    dir: tmpDir,
    left: path.join(tmpDir, leftName),
    right: path.join(tmpDir, rightName),
    base,
    ext,
    leftName,
    rightName,
    mime: getMime(ext),
  }
}

const loadImage = src =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = e => reject(e)
    img.src = src
  })

const canvasToFile = async (canvas, mime, filePath) => {
  const dataUrl = canvas.toDataURL(mime)
  const base64 = dataUrl.split(',')[1]
  await fs.writeFile(filePath, base64, 'base64')
}

const splitAndAdd = async item => {
  if (!item || !item.filePath) {
    log('filePath を取得できませんでした')
    return
  }

  const paths = buildTempPath(item.filePath)
  await fs.mkdir(paths.dir, { recursive: true })

  const buffer = await fs.readFile(item.filePath)
  const base64 = buffer.toString('base64')
  const img = await loadImage(`data:${paths.mime};base64,${base64}`)
  const { width, height } = img
  const halfWidth = Math.floor(width / 2)
  const rightWidth = width - halfWidth

  if (halfWidth <= 0 || rightWidth <= 0) {
    throw new Error(`分割できない画像サイズです: ${width}x${height}`)
  }

  // 先に右を生成
  const rightCanvas = document.createElement('canvas')
  rightCanvas.width = rightWidth
  rightCanvas.height = height
  rightCanvas.getContext('2d').drawImage(img, halfWidth, 0, rightWidth, height, 0, 0, rightWidth, height)
  await canvasToFile(rightCanvas, paths.mime, paths.right)

  // 次に左を生成
  const leftCanvas = document.createElement('canvas')
  leftCanvas.width = halfWidth
  leftCanvas.height = height
  leftCanvas.getContext('2d').drawImage(img, 0, 0, halfWidth, height, 0, 0, halfWidth, height)
  await canvasToFile(leftCanvas, paths.mime, paths.left)

  let added = false
  try {
    const rightId = await eagle.item.addFromPath(paths.right, { name: paths.rightName })
    const leftId = await eagle.item.addFromPath(paths.left, { name: paths.leftName })
    log('分割と追加が完了しました', { leftId, rightId, left: paths.left, right: paths.right })
    added = true
  } finally {
    if (added) {
      try {
        await fs.unlink(paths.left)
        await fs.unlink(paths.right)
      } catch (cleanupError) {
        log('一時ファイル削除に失敗しました', cleanupError)
      }
    }
  }
}

const run = async () => {
  if (!state.ready) {
    log('plugin-create 前の呼び出しをスキップ')
    return
  }
  if (state.running) {
    log('実行中のためスキップ')
    return
  }
  state.running = true

  try {
    const selected = await eagle.item.getSelected()
    if (!selected || selected.length === 0) {
      log('画像が選択されていないため終了')
      return
    }

    let success = 0
    let failed = 0
    for (const item of selected) {
      try {
        await splitAndAdd(item)
        success += 1
      } catch (err) {
        failed += 1
        console.error('[SplitImages] 分割に失敗しました', err, { item })
      }
    }
    log(`処理完了: 成功 ${success} 件 / 失敗 ${failed} 件`)
  } catch (error) {
    console.error('[SplitImages] 分割に失敗しました', error)
  } finally {
    state.running = false
    try {
      await eagle.window.hide()
    } catch (closeError) {
      log('ウィンドウを閉じる際に失敗しました', closeError)
    }
  }
}

eagle.onPluginCreate(async () => {
  state.ready = true
  log('プラグイン初期化')
  try {
    await eagle.window.hide()
  } catch (err) {
    log('初期非表示に失敗しました', err)
  }
})

eagle.onPluginRun(() => {
  log('onPluginRun')
  run()
})

eagle.onPluginShow(() => {
  log('onPluginShow')
})

eagle.onPluginHide(() => {
  log('onPluginHide')
})

eagle.onPluginBeforeExit(() => {
  log('onPluginBeforeExit')
})
