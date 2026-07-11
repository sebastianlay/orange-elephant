// Keep development files out of the built extension package
export default {
  ignoreFiles: [
    'tests',
    'tests/**',
    'package.json',
    'package-lock.json',
    'web-ext-config.mjs',
  ],
};
