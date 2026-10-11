const vendor = new URL('../../public/vendor/three/', import.meta.url);

export async function resolve(specifier, context, next) {
  if (specifier === 'three') return next(new URL('three.module.js', vendor).href, context);
  if (specifier.startsWith('three/addons/')) return next(new URL(specifier.slice('three/'.length), vendor).href, context);
  return next(specifier, context);
}
