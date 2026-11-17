import axios, { type AxiosRequestConfig } from 'axios'
import { z } from 'zod'

const client = axios.create({ baseURL: '/', timeout: 30000 })
const FailureSchema = z.object({
  error: z.string(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional()
})

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issues: { path: string; message: string }[] = []
  ) {
    super(message)
  }
}

export async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  config: AxiosRequestConfig = {}
): Promise<T> {
  try {
    const response = await client.request<unknown>({ ...config, url: path })
    return schema.parse(response.data)
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const failure = FailureSchema.safeParse(error.response?.data)
      let message = '连接失败，操作结果尚未确认。请查询原任务或刷新状态。'
      if (failure.success) {
        message = failure.data.error
      }
      throw new ApiError(message, error.response?.status ?? 0, failure.data?.issues)
    }
    throw error
  }
}

export async function mutate(path: string, data?: object, method = 'POST') {
  return request(path, z.unknown(), { method, data })
}

export function id(value: string) {
  return encodeURIComponent(value)
}
