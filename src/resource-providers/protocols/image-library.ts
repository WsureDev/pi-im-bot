import { z } from 'zod'
import { ResourceProtocolSchema, ProviderDefinitionSchema } from '../protocol'
import { connectionDefinition } from './configuration'

const TagsSchema = z
  .object({
    all: z.array(z.string()).optional(),
    any: z.array(z.string()).optional(),
    not: z.array(z.string()).optional()
  })
  .strict()
const PickSchema = z
  .object({
    count: z.number().int().positive().optional(),
    filters: z
      .object({
        query: z.string().max(200).optional(),
        tags: TagsSchema.optional(),
        platforms: z.array(z.string()).optional(),
        author: z.string().optional(),
        publishedFrom: z.iso.datetime({ offset: true }).optional(),
        publishedTo: z.iso.datetime({ offset: true }).optional()
      })
      .strict()
      .optional(),
    order: z.enum(['random', 'newest', 'oldest']).optional(),
    excludeIds: z.array(z.string()).max(2000).optional(),
    cursor: z.string().max(512000).optional()
  })
  .strict()
const ImageSchema = z
  .object({
    id: z.string(),
    originalUrl: z.url(),
    mimeType: z.string(),
    width: z.number(),
    height: z.number(),
    bytes: z.number(),
    tags: z.array(z.string())
  })
  .passthrough()
const PickOutputSchema = z
  .object({
    maxPick: z.number(),
    matchedTotal: z.number(),
    returned: z.number(),
    nextCursor: z.string().nullable(),
    items: z.array(ImageSchema)
  })
  .passthrough()
const FacetsSchema = z
  .object({
    dimension: z.enum(['all', 'tags', 'authors', 'platforms']).optional(),
    query: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional()
  })
  .strict()
export const imageLibraryProtocol = ResourceProtocolSchema.parse({
  id: 'pi.image-library@1',
  title: '图库',
  description:
    '按元数据过滤图库。数量不足返回实际结果，超过服务上限截断；不放宽筛选。游标延续同一选择，不保证再次 random 调用幂等。',
  methods: [
    {
      id: 'pick',
      title: '挑选图片',
      effect: 'read',
      description:
        '返回图片元数据及原图引用。filters.query 为元数据匹配，不是图像语义搜索。cursor 固定筛选和顺序；count 可改变，仍受 maxPick 限制。',
      inputSchema: z.toJSONSchema(PickSchema),
      outputSchema: z.toJSONSchema(PickOutputSchema),
      example: { count: 1 },
      inputUiSchema: {
        count: { type: 'int', description: '图片数量', default: 1, min: 1 },
        filters: {
          type: 'object',
          description: '筛选条件',
          items: { query: { type: 'string', description: '关键词', default: '' } }
        }
      }
    },
    {
      id: 'facets',
      title: '标签、作者与平台',
      effect: 'read',
      description: '发现实际存在的过滤条件和数量，limit 限制候选值数而非图片数。',
      inputSchema: z.toJSONSchema(FacetsSchema),
      outputSchema: { type: 'object', properties: { maxPick: { type: 'number' } }, required: ['maxPick'] },
      example: { dimension: 'all', limit: 10 }
    }
  ]
})
export const xImageProvider = ProviderDefinitionSchema.parse({
  id: 'x-image',
  title: 'x-image 图库',
  description: '将图片档案 MCP 的结构化选图和标签查询实现为图库协议。',
  configuration: connectionDefinition('http://localhost:19280/mcp'),
  mappings: [
    {
      protocol: imageLibraryProtocol.id,
      method: 'pick',
      transport: { kind: 'mcp', tool: 'pick_images' },
      files: { itemsPath: '/items/*', urlField: 'originalUrl' }
    },
    {
      protocol: imageLibraryProtocol.id,
      method: 'facets',
      transport: { kind: 'mcp', tool: 'list_image_facets' }
    }
  ]
})
