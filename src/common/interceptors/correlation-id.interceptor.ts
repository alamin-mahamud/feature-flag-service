import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { randomUUID } from 'crypto';
import { FastifyRequest, FastifyReply } from 'fastify';

type RequestWithCorrelation = FastifyRequest & { correlationId?: string };

@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<RequestWithCorrelation>();
    const res = context.switchToHttp().getResponse<FastifyReply>();

    const correlationId =
      (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
    req.correlationId = correlationId;
    res.header('x-request-id', correlationId);

    return next.handle();
  }
}
