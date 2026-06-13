import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  correlationId: string;
  tenantId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();
