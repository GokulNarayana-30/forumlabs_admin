import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);

  let targetUrl: URL;
  try {
    targetUrl = new URL(req.url, environment.apiUrl);
  } catch {
    return next(req);
  }

  const configuredApiUrl = new URL(environment.apiUrl);
  const isSameOrigin = targetUrl.origin === configuredApiUrl.origin;
  const basePath = configuredApiUrl.pathname.replace(/\/+$/, '');

  const isConfiguredApiPath =
    targetUrl.pathname === basePath || targetUrl.pathname.startsWith(basePath + '/');

  let authReq = req;
  if (isSameOrigin && isConfiguredApiPath) {
    const session = authService.getSession();
    if (session?.access_token) {
      authReq = req.clone({
        setHeaders: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
    }
  }

  return next(authReq).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        authService.signOut();
      }
      return throwError(() => err);
    }),
  );
};
