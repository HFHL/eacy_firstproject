/**
 * @file SchemaGenerator / SchemaParser round-trip 测试
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import SchemaGenerator from './SchemaGenerator.js'
import SchemaParser from './SchemaParser.js'

/**
 * 构造最小可用设计器模型，用于 round-trip 断言。
 * @returns {Object}
 */
function createDesignModelFixture() {
  return {
    meta: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'roundtrip.schema.json',
      version: '1.0.0',
      projectId: 'test',
      created: '2026-01-01T00:00:00.000Z',
      description: 'roundtrip',
    },
    folders: [
      {
        id: 'folder_1',
        name: '基线访视',
        groups: [
          {
            id: 'group_1',
            name: '基本信息',
            description: '请抽取基本信息表单内容',
            repeatable: false,
            fields: [
              {
                id: 'field_name',
                name: '姓名',
                displayName: '姓名',
                displayType: 'text',
                dataType: 'string',
                required: true,
                nullable: false,
              },
              {
                id: 'field_gender',
                name: '性别',
                displayName: '性别',
                displayType: 'radio',
                dataType: 'string',
                options: ['男', '女'],
              },
              {
                id: 'field_table',
                name: '化验明细',
                displayType: 'table',
                isTable: true,
                config: { tableRows: 'multiRow' },
                children: [
                  {
                    id: 'child_item',
                    name: '项目',
                    displayType: 'text',
                    dataType: 'string',
                  },
                  {
                    id: 'child_value',
                    name: '数值',
                    displayType: 'number',
                    dataType: 'number',
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    enums: {
      gender_enum: {
        id: 'gender_enum',
        type: 'string',
        values: ['男', '女'],
      },
    },
  }
}

test('Schema round-trip 保留目录、字段顺序与关键字段形态', () => {
  const model = createDesignModelFixture()
  const generated = SchemaGenerator.generateSchema(model)
  const parsed = SchemaParser.parseSchema(generated)

  assert.equal(generated.$id, 'roundtrip.schema.json')
  assert.deepEqual(generated['x-property-order'], ['基线访视'])
  assert.deepEqual(
    generated.properties['基线访视']['x-property-order'],
    ['基本信息']
  )

  const parsedFolder = parsed.folders[0]
  assert.equal(parsedFolder.name, '基线访视')

  const parsedGroup = parsedFolder.groups[0]
  assert.equal(parsedGroup.name, '基本信息')
  assert.equal(parsedGroup.description, '请抽取基本信息表单内容')
  assert.deepEqual(
    parsedGroup.fields.map((field) => field.name),
    ['姓名', '性别', '化验明细']
  )
  const groupSchema = generated.properties['基线访视'].properties['基本信息']
  assert.equal(groupSchema.description, '请抽取基本信息表单内容')
  assert.equal(groupSchema['x-extraction-prompt'], '请抽取基本信息表单内容')

  const genderField = parsedGroup.fields.find((field) => field.name === '性别')
  assert.deepEqual(genderField.options, ['男', '女'])

  const tableField = parsedGroup.fields.find((field) => field.name === '化验明细')
  assert.equal(tableField.displayType, 'table')
  assert.equal(tableField.multiRow, true)
  assert.deepEqual(
    tableField.children.map((child) => child.name),
    ['项目', '数值']
  )
})

test('required 与 x-nullable 语义解耦并可 round-trip 保留', () => {
  const model = createDesignModelFixture()
  model.folders[0].groups[0].fields = [
    {
      id: 'f1',
      name: 'A',
      displayType: 'text',
      dataType: 'string',
      required: true,
      nullable: true,
    },
    {
      id: 'f2',
      name: 'B',
      displayType: 'text',
      dataType: 'string',
      required: true,
      nullable: false,
    },
    {
      id: 'f3',
      name: 'C',
      displayType: 'text',
      dataType: 'string',
      required: false,
      nullable: true,
    },
  ]

  const schema = SchemaGenerator.generateSchema(model)
  const groupSchema = schema.properties['基线访视'].properties['基本信息']
  assert.deepEqual(groupSchema.required, ['A', 'B'])
  assert.equal(groupSchema.properties.A['x-nullable'], true)
  assert.equal(groupSchema.properties.B['x-nullable'], false)
  assert.equal(groupSchema.properties.C['x-nullable'], true)

  const parsed = SchemaParser.parseSchema(schema)
  const fields = parsed.folders[0].groups[0].fields
  const fieldA = fields.find((item) => item.name === 'A')
  const fieldB = fields.find((item) => item.name === 'B')
  assert.equal(fieldA.required, true)
  assert.equal(fieldA.nullable, true)
  assert.equal(fieldB.required, true)
  assert.equal(fieldB.nullable, false)
})

test('验证规则与 repeatable 约束写入 schema 并可回读', () => {
  const model = createDesignModelFixture()
  model.folders[0].groups[0].repeatable = true
  model.folders[0].groups[0].minItems = 1
  model.folders[0].groups[0].maxItems = 3
  model.folders[0].groups[0].fields = [{
    id: 'f_rule',
    name: '手机号',
    displayType: 'text',
    dataType: 'string',
    required: false,
    nullable: true,
    minimum: 11,
    maximum: 11,
    pattern: '^1\\d{10}$',
  }]

  const schema = SchemaGenerator.generateSchema(model)
  const groupSchema = schema.properties['基线访视'].properties['基本信息']
  assert.equal(groupSchema.minItems, 1)
  assert.equal(groupSchema.maxItems, 3)
  assert.equal(groupSchema.items.properties['手机号'].minimum, 11)
  assert.equal(groupSchema.items.properties['手机号'].maximum, 11)
  assert.equal(groupSchema.items.properties['手机号'].pattern, '^1\\d{10}$')

  const parsed = SchemaParser.parseSchema(schema)
  const parsedGroup = parsed.folders[0].groups[0]
  assert.equal(parsedGroup.minItems, 1)
  assert.equal(parsedGroup.maxItems, 3)
  assert.equal(parsedGroup.fields[0].minimum, 11)
  assert.equal(parsedGroup.fields[0].maximum, 11)
  assert.equal(parsedGroup.fields[0].pattern, '^1\\d{10}$')
})

test('新模板路径不再写入 conflictPolicy 扩展字段', () => {
  const model = createDesignModelFixture()
  model.folders[0].groups[0].fields = [{
    id: 'f_plain',
    name: '普通字段',
    displayType: 'text',
    dataType: 'string',
    required: false,
    nullable: true,
  }]
  const schema = SchemaGenerator.generateSchema(model)
  const fieldSchema = schema.properties['基线访视'].properties['基本信息'].properties['普通字段']
  assert.equal(fieldSchema['x-conflict-policy'], undefined)
  assert.equal(fieldSchema['x-warn-on-conflict'], undefined)
})

test('table 字段兼容 multiRow 布尔配置并生成 array schema', () => {
  const model = createDesignModelFixture()
  model.folders[0].groups[0].fields = [{
    id: 'table_compat',
    name: '治疗记录',
    displayType: 'table',
    isTable: true,
    multiRow: true,
    children: [
      {
        id: 'col_1',
        name: '药品',
        displayType: 'text',
        dataType: 'string',
      }
    ],
  }]

  const schema = SchemaGenerator.generateSchema(model)
  const tableSchema = schema.properties['基线访视'].properties['基本信息'].properties['治疗记录']
  assert.equal(tableSchema.type, 'array')
  assert.equal(tableSchema.items.type, 'object')
})

test('SchemaParser 兼容 legacy table 行数语义', () => {
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: {
      访视: {
        type: 'object',
        properties: {
          基本信息: {
            type: 'object',
            properties: {
              证件信息: {
                type: 'object',
                'x-display': 'table',
                'x-row-constraint': 'multi_row',
                'x-table-config': { multiRow: true },
                properties: {
                  证件号: { type: 'string' },
                },
              },
              联系方式: {
                type: 'object',
                'x-display': 'table',
                'x-extended-config': '{"tableRows":"singleRow"}',
                properties: {
                  手机号: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  }

  const parsed = SchemaParser.parseSchema(schema)
  const fields = parsed.folders[0].groups[0].fields
  const multiRowTable = fields.find((f) => f.name === '证件信息')
  const singleRowTable = fields.find((f) => f.name === '联系方式')

  assert.equal(multiRowTable.displayType, 'table')
  assert.equal(multiRowTable.multiRow, true)
  assert.equal(multiRowTable.config.tableRows, 'multiRow')
  assert.equal(singleRowTable.displayType, 'table')
  assert.equal(singleRowTable.multiRow, false)
  assert.equal(singleRowTable.config.tableRows, 'singleRow')
})

test('SchemaGenerator 支持 table 内嵌 table 的递归生成', () => {
  const model = createDesignModelFixture()
  model.folders[0].groups[0].fields = [{
    id: 'table_parent',
    name: '身份信息',
    displayType: 'table',
    isTable: true,
    config: { tableRows: 'singleRow' },
    children: [
      {
        id: 'name',
        name: '患者姓名',
        displayType: 'text',
        dataType: 'string',
      },
      {
        id: 'table_child',
        name: '身份ID',
        displayType: 'table',
        isTable: true,
        config: { tableRows: 'multiRow' },
        children: [
          {
            id: 'id_type',
            name: '证件类型',
            displayType: 'radio',
            dataType: 'string',
            options: ['居民身份证', '护照'],
          },
          {
            id: 'id_number',
            name: '证件号码',
            displayType: 'text',
            dataType: 'string',
          },
        ],
      },
    ],
  }]

  const schema = SchemaGenerator.generateSchema(model)
  const identitySchema = schema.properties['基线访视'].properties['基本信息'].properties['身份信息']
  const idTableSchema = identitySchema.properties['身份ID']
  assert.equal(identitySchema.type, 'object')
  assert.equal(identitySchema['x-display'], 'table')
  assert.equal(idTableSchema.type, 'array')
  assert.equal(idTableSchema.items.type, 'object')
  assert.deepEqual(
    Object.keys(idTableSchema.items.properties),
    ['证件类型', '证件号码']
  )
})

