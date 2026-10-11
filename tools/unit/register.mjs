// Lets `node --test` resolve the browser import-map specifiers ('three',
// 'three/addons/...') to the vendored copy in public/vendor.
import { register } from 'node:module';

register(new URL('./three-hooks.mjs', import.meta.url));
