#!/usr/bin/env node
/**
 * 样式治理巡检脚本。
 *
 * 功能：
 * - report 模式：输出违规统计，不阻断退出。
 * - gate 模式：若存在新增违规，返回非 0 退出码。
 *
 * 约束：
 * - 仅检查 src 主干目录，自动忽略 backup/copy 等副本目录。
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import process from 'node:process'

const ROOT = resolve(process.cwd())
const SRC_ROOT = resolve(ROOT, 'src')
const modeArg = process.argv.find((arg) => arg.startsWith('--mode=')) || '--mode=report'
const mode = modeArg.split('=')[1] || 'report'
const baselineArg = process.argv.find((arg) => arg.startsWith('--baseline='))
const baselinePath = baselineArg ? resolve(ROOT, baselineArg.split('=')[1]) : null

const IGNORE_SEGMENTS = ['backup', 'backupfiles', 'copy', '__tests__', '.history']
const IGNORE_FILES = ['src/pages/patientdetail/index copy.jsx']
const FILE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx']
const FONT_SIZE_ALLOWED = new Set(['12', '14', '16', '20', '24'])

const RULES = {
  hexColor: /#[0-9a-fA-F]{3,8}\b/g,
  fontSizeNumeric: /fontSize\s*:\s*(\d+)/g,
  modalBodyStyle: /<Modal[\s\S]{0,500}?\bbodyStyle\s*=\s*\{/g,
}

/**
 * 判断文件路径是否应该跳过。
 *
 * @param {string} path 文件/目录路径
 * @returns {boolean} 是否跳过
 */
function shouldIgnore(path) {
  const normalized = path.toLowerCase()
  const normalizedSlash = normalized.replaceAll('\\', '/')
  if (IGNORE_FILES.some((file) => normalizedSlash.endsWith(file))) return true
  return IGNORE_SEGMENTS.some((segment) => normalized.includes(`\\${segment}\\`) || normalized.includes(`/${segment}/`))
}

/**
 * 递归收集需要检查的源文件。
 *
 * @param {string} dir 目录
 * @param {string[]} result 结果容器
 * @returns {string[]} 源文件路径列表
 */
function collectFiles(dir, result = []) {
  if (shouldIgnore(dir)) return result
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (shouldIgnore(fullPath)) continue
    if (entry.isDirectory()) {
      collectFiles(fullPath, result)
      continue
    }
    if (FILE_EXTENSIONS.some((ext) => fullPath.endsWith(ext))) {
      result.push(fullPath)
    }
  }
  return result
}

/**
 * 扫描单个文件的违规项。
 *
 * @param {string} filePath 文件路径
 * @returns {{file:string, hexColor:number, nonStandardFontSize:number, bodyStyle:number}} 扫描结果
 */
function scanFile(filePath) {
  const text = readFileSync(filePath, 'utf8')
  const hexColorCount = (text.match(RULES.hexColor) || []).length
  const bodyStyleCount = (text.match(RULES.modalBodyStyle) || []).length

  let nonStandardFontSize = 0
  const fontMatches = text.matchAll(RULES.fontSizeNumeric)
  for (const match of fontMatches) {
    const value = match[1]
    if (!FONT_SIZE_ALLOWED.has(value)) {
      nonStandardFontSize += 1
    }
  }

  return {
    file: filePath.replace(ROOT + '\\', ''),
    hexColor: hexColorCount,
    nonStandardFontSize,
    bodyStyle: bodyStyleCount,
  }
}

if (!statSync(SRC_ROOT, { throwIfNoEntry: false })) {
  console.error('[style-governance] 未找到 src 目录，无法执行巡检。')
  process.exit(1)
}

const files = collectFiles(SRC_ROOT)
const rows = files.map(scanFile).filter((row) => row.hexColor || row.nonStandardFontSize || row.bodyStyle)

const summary = rows.reduce(
  (acc, row) => {
    acc.hexColor += row.hexColor
    acc.nonStandardFontSize += row.nonStandardFontSize
    acc.bodyStyle += row.bodyStyle
    return acc
  },
  { hexColor: 0, nonStandardFontSize: 0, bodyStyle: 0 }
)

console.log('[style-governance] 扫描文件数:', files.length)
console.log('[style-governance] 违规文件数:', rows.length)
console.table(rows.slice(0, 80))
console.log('[style-governance] 汇总:', summary)

if (mode === 'gate') {
  if (baselinePath && existsSync(baselinePath)) {
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
    const baselineSummary = baseline.summary || {}
    const exceeds =
      summary.hexColor > Number(baselineSummary.hexColor || 0) ||
      summary.nonStandardFontSize > Number(baselineSummary.nonStandardFontSize || 0) ||
      summary.bodyStyle > Number(baselineSummary.bodyStyle || 0)

    if (exceeds) {
      console.error('[style-governance] gate 模式触发阻断：违规总量超过基线。')
      console.error('[style-governance] baseline:', baselineSummary)
      process.exit(2)
    }
    console.log('[style-governance] gate 通过：未超过基线。')
  } else if (rows.length > 0) {
    console.error('[style-governance] gate 模式触发阻断：未提供基线且存在违规。')
    process.exit(2)
  }
}

