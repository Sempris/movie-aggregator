import { createRouter, createWebHistory } from 'vue-router';
import HomeView from './views/HomeView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    {
      path: '/movie/:tmdbId(\\d+)',
      name: 'movie',
      component: () => import('./views/MovieView.vue'),
      props: (route) => ({ tmdbId: Number(route.params['tmdbId']) }),
    },
    { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue') },
    { path: '/signin', name: 'signin', component: () => import('./views/SignInView.vue') },
    {
      path: '/auth/callback',
      name: 'auth-callback',
      component: () => import('./views/AuthCallbackView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('./views/NotFoundView.vue'),
    },
  ],
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition;
    // Typing in search only changes the query string; keep the scroll position.
    if (to.name === from.name && to.path === from.path) return false;
    return { top: 0 };
  },
});
