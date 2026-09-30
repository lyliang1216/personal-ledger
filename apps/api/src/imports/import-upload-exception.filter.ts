import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  PayloadTooLargeException,
} from '@nestjs/common'

import type { AuthenticatedRequest } from '../auth/auth.types'
import { ImportsService } from './imports.service'

interface ErrorResponse {
  status(code: number): ErrorResponse
  json(body: unknown): void
}

@Catch(PayloadTooLargeException)
export class ImportUploadExceptionFilter implements ExceptionFilter {
  constructor(private readonly importsService: ImportsService) {}

  async catch(_exception: PayloadTooLargeException, host: ArgumentsHost): Promise<void> {
    const context = host.switchToHttp()
    const request = context.getRequest<AuthenticatedRequest>()
    const response = context.getResponse<ErrorResponse>()
    const task = request.user
      ? await this.importsService.createFailedTask(
          request.user.userId,
          '未获取文件名',
          '账单文件超过 10MB 限制',
        )
      : null

    response.status(413).json({
      statusCode: 413,
      message: '账单文件超过 10MB 限制',
      ...(task ? { importTaskId: task.id } : {}),
    })
  }
}
