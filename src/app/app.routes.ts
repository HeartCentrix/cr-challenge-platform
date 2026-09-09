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
    path: 'reset-admin-aria/login',
    title: 'Admin login - CodeReport',
    loadComponent: () => import('./admin-auth/admin-login').then(m => m.AdminLogin),
  },
  {
    path: 'stats-admin/login',
    title: 'Stats admin login - CodeReport',
    data: { destination: '/stats-admin' },
    loadComponent: () => import('./admin-auth/admin-login').then(m => m.AdminLogin),
  },
  {
    path: 'stats-admin',
    canActivate: [adminGuard],
    title: 'Candidate statistics - CodeReport',
    loadComponent: () => import('./admin-stats/admin-stats').then(m => m.AdminStats),
  },
  {
    path: 'stats-admin/candidates/:id',
    canActivate: [adminGuard],
    title: 'Candidate challenge details - CodeReport',
    loadComponent: () => import('./admin-stats/admin-candidate').then(m => m.AdminCandidate),
  },
  {
    path: 'reset-admin-aria',
    canActivate: [adminGuard],
    title: 'Reset daily limit - CodeReport',
    loadComponent: () => import('./reset-admin-aria/reset-admin-aria').then(m => m.ResetAdminAria),
  },
  { path: '**', redirectTo: '' },
];
