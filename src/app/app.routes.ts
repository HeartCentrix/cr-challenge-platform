import { Routes } from '@angular/router';
import { adminGuard } from './admin-auth/admin-auth';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Challendge-CodeReport',
    loadComponent: () => import('./challenge/challenge').then(m => m.Challenge),
  },
  {
    path: 'reset-admin-aaron/login',
    title: 'Admin login - CodeReport',
    loadComponent: () => import('./admin-auth/admin-login').then(m => m.AdminLogin),
  },
  {
    path: 'reset-admin-aaron',
    canActivate: [adminGuard],
    title: 'Reset daily limit - CodeReport',
    loadComponent: () => import('./reset-admin-aaron/reset-admin-aaron').then(m => m.ResetAdminAaron),
  },
  { path: '**', redirectTo: '' },
];
