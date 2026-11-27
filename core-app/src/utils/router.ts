import { AppError } from './errors.ts';

export interface HttpRequest {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface RouteRequest extends HttpRequest {
  params: Record<string, string>;
}

export interface HttpResponse {
  status: number;
  body: unknown;
}

export type Handler = (request: RouteRequest) => Promise<HttpResponse>;
export type Middleware = (handler: Handler) => Handler;

interface Route {
  method: string;
  pattern: string;
  segments: string[];
  handler: Handler;
}

/** A tiny framework-free router. Path parameters use the `:name` syntax. */
export class Router {
  private readonly routes: Route[] = [];
  private readonly middleware: Middleware[] = [];

  use(middleware: Middleware): void {
    this.middleware.push(middleware);
  }

  get(pattern: string, handler: Handler): void {
    this.add('GET', pattern, handler);
  }

  post(pattern: string, handler: Handler): void {
    this.add('POST', pattern, handler);
  }

  async handle(request: HttpRequest): Promise<HttpResponse> {
    const method = request.method.toUpperCase();
    const pathSegments = splitPath(request.path);
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const params = match(route.segments, pathSegments);
      if (params) return this.wrap(route.handler)({ ...request, method, params });
    }
    return this.wrap(async () => {
      throw new AppError('ROUTE_NOT_FOUND', `No route for ${method} ${request.path}`);
    })({ ...request, method, params: {} });
  }

  private add(method: string, pattern: string, handler: Handler): void {
    this.routes.push({ method, pattern, segments: splitPath(pattern), handler });
  }

  private wrap(handler: Handler): Handler {
    return this.middleware.reduceRight((next, middleware) => middleware(next), handler);
  }
}

function splitPath(path: string): string[] {
  const withoutQuery = path.split('?')[0] ?? '';
  return withoutQuery.split('/').filter(Boolean);
}

function match(pattern: string[], actual: string[]): Record<string, string> | null {
  if (pattern.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    const expected = pattern[i]!;
    const value = actual[i]!;
    if (expected.startsWith(':')) params[expected.slice(1)] = decodeURIComponent(value);
    else if (expected !== value) return null;
  }
  return params;
}
