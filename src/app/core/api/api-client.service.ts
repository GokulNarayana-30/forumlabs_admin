import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
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
  private readonly idempotencyKeyCache = new Map<string, { payloadHash: string; key: string }>();

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

  private getIdempotencyKey(route: string, body: unknown): string {
    const payloadHash = JSON.stringify(body ?? {});
    const existing = this.idempotencyKeyCache.get(route);
    if (existing && existing.payloadHash === payloadHash) {
      return existing.key;
    }
    const newKey = this.generateIdempotencyKey();
    this.idempotencyKeyCache.set(route, { payloadHash, key: newKey });
    return newKey;
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
    const url = this.buildUrl(path);
    let headers =
      options?.headers instanceof HttpHeaders ? options.headers : new HttpHeaders(options?.headers);

    if (options?.idempotent) {
      const key = this.getIdempotencyKey(path, body);
      headers = headers.set('Idempotency-Key', key);
    }

    return this.http
      .post<T>(url, body, { params: options?.params, headers })
      .pipe(catchError((err) => this.handleError(err)));
  }

  patch<T>(path: string, body: unknown = {}, options?: ApiClientOptions): Observable<T> {
    const url = this.buildUrl(path);
    let headers =
      options?.headers instanceof HttpHeaders ? options.headers : new HttpHeaders(options?.headers);

    if (options?.idempotent) {
      const key = this.getIdempotencyKey(path, body);
      headers = headers.set('Idempotency-Key', key);
    }

    return this.http
      .patch<T>(url, body, { params: options?.params, headers })
      .pipe(catchError((err) => this.handleError(err)));
  }

  put<T>(path: string, body: unknown = {}, options?: ApiClientOptions): Observable<T> {
    const url = this.buildUrl(path);
    let headers =
      options?.headers instanceof HttpHeaders ? options.headers : new HttpHeaders(options?.headers);

    if (options?.idempotent) {
      const key = this.getIdempotencyKey(path, body);
      headers = headers.set('Idempotency-Key', key);
    }

    return this.http
      .put<T>(url, body, { params: options?.params, headers })
      .pipe(catchError((err) => this.handleError(err)));
  }

  delete<T>(path: string, options?: ApiClientOptions): Observable<T> {
    const url = this.buildUrl(path);
    return this.http
      .delete<T>(url, { params: options?.params, headers: options?.headers })
      .pipe(catchError((err) => this.handleError(err)));
  }
}
