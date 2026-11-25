import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const DEFAULT_ENV_FILE = path.join(ROOT, '.env.local')

export const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4'
export const DEFAULT_MODEL = 'glm-4-flash'

export function parseEnvFile(filePath = DEFAULT_ENV_FILE) {
  let content
  try {
    content = readFileSync(filePath, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return {}
    throw error
  }

  const result = {}
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 0) continue
    const key = line.slice(0, separator).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue

    let value = line.slice(separator + 1).trim()
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    if (quoted) value = value.slice(1, -1)
    result[key] = value
  }
  return result
}

export function loadModelConfig(options = {}) {
  const filePath = options.envFile ?? DEFAULT_ENV_FILE
  const fromFile = parseEnvFile(filePath)
  const read = (key, fallback = '') => {
    const value = process.env[key] ?? fromFile[key] ?? fallback
    return String(value).trim()
  }

  return {
    apiKey: read('ZHIPU_API_KEY'),
    baseUrl: read('ZHIPU_BASE_URL', DEFAULT_BASE_URL).replace(/\/+$/, ''),
    model: read('ZHIPU_MODEL', DEFAULT_MODEL),
  }
}

export function checkEnvFileSafety(filePath = DEFAULT_ENV_FILE) {
  const errors = []
  for (const key of Object.keys(parseEnvFile(filePath))) {
    if (!key.startsWith('VITE_')) continue
    if (/KEY|SECRET|TOKEN|PASSWORD/i.test(key)) {
      errors.push(`${key} 带 VITE_ 前缀，会被打包进前端，必须去掉前缀`)
    }
  }
  return { ok: errors.length === 0, errors }
}

export function validateModelConfig(config) {
  const errors = []
  const warnings = []
  const key = config.apiKey ?? ''

  if (!key) {
    errors.push('ZHIPU_API_KEY 为空，请把真实 key 粘贴到 .env.local 的等号右边')
  } else {
    if (/^(your-|changeme|placeholder|xxx|sk-xxxx)/i.test(key)) {
      errors.push('ZHIPU_API_KEY 仍是占位符')
    }
    if (/\s/.test(key)) {
      errors.push('ZHIPU_API_KEY 含空白字符，粘贴时可能带了多余内容')
    }
    if (key.length < 20) {
      errors.push(`ZHIPU_API_KEY 长度只有 ${key.length}，疑似不完整`)
    }
  }

  let url
  try {
    url = new URL(config.baseUrl ?? '')
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
      errors.push('ZHIPU_BASE_URL 必须是 https，本地模型才允许 http')
    }
  } catch {
    errors.push('ZHIPU_BASE_URL 不是合法地址')
  }

  if (!(config.model ?? '').trim()) {
    errors.push('ZHIPU_MODEL 为空')
  } else if (!/flash/i.test(config.model)) {
    warnings.push('当前 ZHIPU_MODEL 不是 flash 免费档，调用会消耗账户余额')
  }

  if (url && /open\.bigmodel\.cn/.test(url.hostname)) {
    warnings.push('内置 key 为全体用户共享，上线前必须加每用户调用配额')
  }

  return { ok: errors.length === 0, errors, warnings }
}

export function maskSecret(value) {
  if (!value) return '(未配置)'
  if (value.length <= 12) return '****'
  return `${value.slice(0, 3)}****${value.slice(-4)}`
}

function runCheck() {
  const envFile = DEFAULT_ENV_FILE
  const config = loadModelConfig({ envFile })
  const safety = checkEnvFileSafety(envFile)
  const result = validateModelConfig(config)

  console.log('模型配置检查')
  console.log(`  配置文件: ${envFile}`)
  console.log(`  Key:      ${maskSecret(config.apiKey)}`)
  console.log(`  接口地址: ${config.baseUrl}`)
  console.log(`  模型:     ${config.model}`)

  for (const error of [...safety.errors, ...result.errors]) {
    console.log(`  [错误] ${error}`)
  }
  for (const warning of result.warnings) {
    console.log(`  [提示] ${warning}`)
  }

  if (safety.ok && result.ok) {
    console.log('  检查通过')
  } else {
    console.log('  检查未通过')
  }

  process.exitCode = safety.ok && result.ok ? 0 : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCheck()
}
