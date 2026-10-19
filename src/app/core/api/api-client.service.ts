import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ApiClientOptions {
  params?:
    HttpParams | Record<string, string | number | boolean | readonly (string | number | boolean)[]>;
  headers?: HttpHeaders | Record<string, string | string[]>;
  idempotent?: boolean;
}

export interface ApiErrorContract {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

@Injectable({
  providedIn: 'root',
})
export class ApiClient {
  private readonly http = inject(HttpClient);
  /**
   * One Idempotency-Key per (method, route, payload) while its outcome is uncertain. The server
   * replays a stored success for a reused key, so the entry is retired as soon as a request
   * settles definitely (any 2xx, or a 4xx other than 408 / 409 idempotency_in_progress) and kept
   * only for network errors, 5xx, 408 and 409 in-progress, where a retry must reuse the key.
   */
  private readonly idempotencyKeyCache = new Map<string, string>();

  private buildUrl(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    const cleanBase = environment.apiUrl.replace(/\/+$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${cleanBase}${cleanPath}`;
  }

  private generateIdempotencyKey(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `chk_${hex}`;
  }

  private idempotencyCacheKey(method: string, route: string, body: unknown): string {
    return `${method} ${route}\n${JSON.stringify(body ?? {})}`;
  }

  private getIdempotencyKey(cacheKey: string): string {
    const existing = this.idempotencyKeyCache.get(cacheKey);
    if (existing) return existing;
    const newKey = this.generateIdempotencyKey();
    this.idempotencyKeyCache.set(cacheKey, newKey);
    return newKey;
  }

  /** True when the outcome of a failed request is unknown, so a retry must reuse its key. */
  private static isUncertainFailure(err: unknown): boolean {
    if (!(err instanceof HttpErrorResponse)) return true;
    if (err.status === 0 || err.status >= 500 || err.status === 408) return true;
    return err.status === 409 && err.error?.code === 'idempotency_in_progress';
  }

  /** Forget every cached key (call on sign-out: the singleton outlives the signed-in user). */
  resetIdempotencyKeys(): void {
    this.idempotencyKeyCache.clear();
  }

  private sendWithBody<T>(
    method: 'POST' | 'PATCH' | 'PUT',
    path: string,
    body: unknown,
    options?: ApiClientOptions,
  ): Observable<T> {
    const url = this.buildUrl(path);
    let headers =
      options?.headers instanceof HttpHeaders ? options.headers : new HttpHeaders(options?.headers);

    let cacheKey: string | null = null;
    if (options?.idempotent) {
      cacheKey = this.idempotencyCacheKey(method, path, body);
      headers = headers.set('Idempotency-Key', this.getIdempotencyKey(cacheKey));
    }

    const retire = (): void => {
      if (cacheKey) this.idempotencyKeyCache.delete(cacheKey);
    };

    return this.http.request<T>(method, url, { body, params: options?.params, headers }).pipe(
      tap({ next: retire }),
      catchError((err) => {
        if (!ApiClient.isUncertainFailure(err)) retire();
        return this.handleError(err);
      }),
    );
  }

  private handleError(err: unknown): Observable<never> {
    if (err instanceof HttpErrorResponse) {
      const body = err.error;
      const apiError: ApiErrorContract = {
        status: err.status,
        code: typeof body?.code === 'string' ? body.code : 'api_error',
        message:
          typeof body?.message === 'string' ? body.message : err.statusText || 'Request failed',
        details:
          body && typeof body === 'object' && body.details
            ? (body.details as Record<string, unknown>)
            : undefined,
      };
      return throwError(() => apiError);
    }
    return throwError(() => err);
  }

  get<T>(path: string, options?: ApiClientOptions): Observable<T> {
    const url = this.buildUrl(path);
    return this.http
      .get<T>(url, { params: options?.params, headers: options?.headers })
      .pipe(catchError((err) => this.handleError(err)));
  }

  post<T>(path: string, body: unknown = {}, options?: ApiClientOptions): Observable<T> {
    return this.sendWithBody<T>('POST', path, body, options);
  }

  patch<T>(path: string, body: unknown = {}, options?: ApiClientOptions): Observable<T> {
    return this.sendWithBody<T>('PATCH', path, body, options);
  }

  put<T>(path: string, body: unknown = {}, options?: ApiClientOptions): Observable<T> {
    return this.sendWithBody<T>('PUT', path, body, options);
  }

  delete<T>(path: string, options?: ApiClientOptions): Observable<T> {
    const url = this.buildUrl(path);
    return this.http
      .delete<T>(url, { params: options?.params, headers: options?.headers })
      .pipe(catchError((err) => this.handleError(err)));
  }
}
