/**
 * @file CSVConverter 列名归一与 group prompt 映射测试
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { CSVConverter } from './csvConverter.js'

/**
 * 构造带列名变体的 CSV 数据。
 * @returns {string[][]}
 */
function createAliasedCsvData() {
  return [
    [
      '文件夹', '层级1', '层级2', '层级3', '层级4', '层级5', '层级6', '层级7', '层级8', '层级9', '层级10',
      '数据单位', '展示类型', 'group是否可重复', 'table是否多行', '可选项值', '数据类型',
      '字段冲突处理规则', '提示词- 字段说明', '抽取提示词（示例）', '字段可否为空（nullable）',
      '是否为主键级字段', '时间属性字段绑定（时间依赖字段）', '是否为敏感字段（is_sensitive）',
      '字段是否可编辑（editable）', '是否为抽取单位组', '主要来源（Primary Sources）', '次要来源（Secondary Sources）'
    ],
    [
      '访视A', '表单A', '', '', '', '', '', '', '', '', '',
      '', 'group', '不可重复', '', '', '',
      '', '', '这是表单级抽取提示词', '', '', '', '', '', '是', '病案首页', '出院小结'
    ],
    [
      '访视A', '表单A', '姓名', '', '', '', '', '', '', '', '',
      '', 'text', '', '', '', '文本',
      '', '姓名字段说明', '请抽取姓名', '否', '是', '', '', '是', '', '', ''
    ]
  ]
}

test('CSVConverter 支持列名变体并正确映射 group/field 语义', () => {
  const designModel = CSVConverter.csvToDesignModel(createAliasedCsvData())
  const folder = designModel.folders[0]
  const group = folder.groups[0]
  const field = group.fields[0]

  assert.equal(folder.name, '访视A')
  assert.equal(group.name, '表单A')
  assert.equal(group.description, '这是表单级抽取提示词')
  assert.deepEqual(group.sources?.primary, ['病案首页'])
  assert.deepEqual(group.sources?.secondary, ['出院小结'])
  assert.equal(field.name, '姓名')
  assert.equal(field.description, '姓名字段说明')
  assert.equal(field.extractionPrompt, '请抽取姓名')
})
