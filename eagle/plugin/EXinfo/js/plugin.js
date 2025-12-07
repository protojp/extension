const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')

// 投稿処理は外部の post.js を CLI 実行で呼び出す
const POST_SCRIPT = 'C:\\github\\protojp\\sns\\accounts\\x\\post.js'
const ACCOUNTS_PATH = 'C:\\github\\protojp\\sns\\accounts\\x\\auth.json'

const state = {
  accounts: [],
  selectedId: '',
  posting: false
}

let accountSelect
let postButton
let statusLine
let loraEl
let cpEl

const setStatus = (message, type = 'info') => {
  if (!statusLine) return
  statusLine.textContent = message
  statusLine.dataset.type = type
}

const setTheme = async () => {
  const theme = await eagle.app.theme
  document.body.setAttribute('theme', theme)
}

const getSelectedItems = async (extraFields = []) => {
  const fields = Array.from(new Set(['tags', ...extraFields]))
  const items = await eagle.item.get({ isSelected: true, fields })
  if (!items) return []
  return Array.isArray(items) ? items : [items]
}

const EXCLUDED_LORA_NAMES = ['Hyper-SDXL-8steps-lora']

const extractLoraNames = (tags = []) => {
  const names = tags
    .map(tag => {
      const match = tag.match(/<lora:([^:>]+)[^>]*>/i)
      return match ? match[1] : null
    })
    .filter(name => name && !EXCLUDED_LORA_NAMES.includes(name))
  return [...new Set(names)]
}

const extractCheckpointNames = (tags = []) => {
  const names = tags
    .map(tag => {
      const match = tag.match(/^Model:\s*(.+)$/i)
      return match ? match[1].trim() : null
    })
    .filter(Boolean)
  return [...new Set(names)]
}

const renderValues = (el, values) => {
  if (!el) return
  el.innerHTML = ''
  if (!values.length) {
    el.textContent = '-'
    return
  }
  values.forEach(value => {
    const pill = document.createElement('span')
    pill.className = 'pill'
    pill.textContent = value
    el.appendChild(pill)
  })
}

let lastRenderKey = ''

const updateInfo = async (force = false) => {
  const items = await getSelectedItems()
  const tags = items.flatMap(item => item?.tags || [])
  const loraNames = extractLoraNames(tags)
  const cpNames = extractCheckpointNames(tags)
  const currentKey = `${loraNames.join('|')}__${cpNames.join('|')}`
  if (!force && currentKey === lastRenderKey) {
    return currentKey
  }
  renderValues(loraEl, loraNames)
  renderValues(cpEl, cpNames)
  lastRenderKey = currentKey
  return currentKey
}

const validateAccount = account => {
  if (!account || !account.id || !account.auth) return false
  const { consumerKey, consumerSecret, accessToken, accessTokenSecret } = account.auth
  return Boolean(consumerKey && consumerSecret && accessToken && accessTokenSecret)
}

const loadAccounts = async () => {
  const raw = await fs.promises.readFile(ACCOUNTS_PATH, 'utf8')
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error('配列形式ではありません')
  const validAccounts = parsed.filter(validateAccount)
  if (!validAccounts.length) throw new Error('有効なアカウントがありません')
  state.accounts = validAccounts
  const first = validAccounts[0]
  state.selectedId = first.id
  return validAccounts
}

const toLocalPath = value => {
  if (!value) return value
  if (value.startsWith('file://')) return decodeURIComponent(value.replace('file://', ''))
  return value
}

const getSingleSelectedItem = async () => {
  const items = await getSelectedItems(['id', 'name', 'ext', 'path', 'filePath', 'url', 'originPath', 'folderPath'])
  if (!items.length) throw new Error('画像が選択されていません')
  const item = items[0]
  const query = new URLSearchParams(location.search)
  const queryPathRaw = query.get('path')
  const queryPath = queryPathRaw ? decodeURIComponent(queryPathRaw) : ''
  const resolvedPathRaw = item.path || item.filePath || item.originPath || item.url || queryPath
  const resolvedPath = toLocalPath(resolvedPathRaw)
  if (!resolvedPath) throw new Error('画像パス/URLを取得できませんでした')
  return { ...item, path: resolvedPath }
}

const renderAccounts = accounts => {
  if (!accountSelect) return
  accountSelect.innerHTML = ''
  const placeholder = document.createElement('option')
  placeholder.value = ''
  placeholder.textContent = 'IDを選択'
  accountSelect.appendChild(placeholder)
  accounts.forEach(acc => {
    const opt = document.createElement('option')
    opt.value = acc.id
    opt.textContent = acc.id
    accountSelect.appendChild(opt)
  })
  const first = accounts[0]
  state.selectedId = first.id
  accountSelect.value = first.id
  postButton.disabled = false
  setStatus(`投稿先: ${first.id}`)
}

const postViaCli = async textOverride => {
  const item = await getSingleSelectedItem()
  const text = textOverride || item.name || 'Shared from Eagle'
  const args = [POST_SCRIPT, '--image', item.path, '--text', text, '--skip-verify']
  return new Promise((resolve, reject) => {
    execFile('node', args, { timeout: 120000 }, (error, stdout, stderr) => {
      if (stdout) console.log('[EXinfo] post stdout:', stdout)
      if (stderr) console.error('[EXinfo] post stderr:', stderr)
      if (error) {
        reject(error)
      } else {
        try {
          const match = stdout.match(/tweet URL:\s*(https?:\/\/\S+)/i)
          if (match) {
            resolve(match[1])
            return
          }
        } catch (_) {
          // ignore parse error
        }
        resolve(null)
      }
    })
  })
}

const init = async () => {
  accountSelect = document.getElementById('selectID')
  postButton = document.getElementById('postX')
  statusLine = document.getElementById('statusLine')
  loraEl = document.getElementById('loraName')
  cpEl = document.getElementById('ckptName')

  await setTheme()
  await updateInfo(true)
  try {
    const accounts = await loadAccounts()
    renderAccounts(accounts)
  } catch (err) {
    postButton.disabled = true
    setStatus(`auth.json 読み込み失敗: ${err.message}`, 'error')
  }
  setTimeout(() => {
    updateInfo()
  }, 1000)

  eagle.onThemeChanged(theme => {
    document.body.setAttribute('theme', theme)
  })

  accountSelect.addEventListener('change', e => {
    state.selectedId = e.target.value
    postButton.disabled = !state.selectedId || state.posting
    if (!state.selectedId) {
      setStatus('投稿先IDを選択してください', 'warn')
    } else {
      setStatus(`投稿先: ${state.selectedId}`)
    }
  })

  postButton.addEventListener('click', async () => {
    if (state.posting) return
    if (!state.selectedId) {
      setStatus('投稿先IDを選択してください', 'warn')
      return
    }
    try {
      state.posting = true
      postButton.disabled = true
      setStatus('X に投稿中...')
      const tweetUrl = await postViaCli()
      if (tweetUrl) {
        setStatus(`投稿完了: ${tweetUrl}`, 'success')
      } else {
        setStatus('投稿完了（ID未取得）', 'warn')
      }
    } catch (err) {
      console.error('[EXinfo] post error:', err)
      setStatus(`投稿に失敗しました: ${err.message}`, 'error')
    } finally {
      state.posting = false
      postButton.disabled = !state.selectedId
    }
  })
}

window.addEventListener('DOMContentLoaded', () => {
  eagle.onPluginCreate(async () => {
    await init()
  })
})

// デバッグ用に公開
window.EXinfoPlugin = {
  state,
  loadAccounts,
  getSingleSelectedItem,
  postViaCli
}
