import '@fontsource-variable/archivo/wdth.css';
import './styles/main.css';
import * as Sentry from '@sentry/vue';
import { createPinia } from 'pinia';
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';

const app = createApp(App);
const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({ app, dsn: import.meta.env.VITE_SENTRY_DSN, tracesSampleRate: 0 });
}

app.use(pinia);
app.use(router);
app.mount('#app');
