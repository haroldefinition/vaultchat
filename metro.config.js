// Metro bundler config — optimized for faster reloads and a more stable dev bridge.
// Built on top of Expo's default config so SDK-level behavior is preserved.

const { getDefaultConfig } = require('expo/metro-config');
const { FileStore } = require('metro-cache');
const path = require('path');
const os = require('os');

const config = getDefaultConfig(__dirname);

// ---------------------------------------------------------------------------
// 1. Inline requires: modules only load the first time they're used, not on
//    app boot. Single biggest win for cold-start and HMR speed.
// ---------------------------------------------------------------------------
config.transformer = {
  ...config.transformer,
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  }),
  // Keep class/function names — helps React Native stack traces and avoids
  // "undefined is not an object" bugs when minifier mangles WebRTC /
  // native-module bindings.
  minifierConfig: {
    keep_classnames: true,
    keep_fnames: true,
    mangle: { keep_classnames: true, keep_fnames: true },
    compress: { drop_console: false },
  },
};

// ---------------------------------------------------------------------------
// 2. Worker pool — use all cores except one so the OS stays responsive.
// ---------------------------------------------------------------------------
config.maxWorkers = Math.max(1, os.cpus().length - 1);

// ---------------------------------------------------------------------------
// 3. Persistent disk cache — survives `expo start` restarts.
// ---------------------------------------------------------------------------
config.cacheStores = [
  new FileStore({
    root: path.join(os.tmpdir(), 'vaultchat-metro-cache'),
  }),
];

// ---------------------------------------------------------------------------
// 4. Resolver — stop Metro from watching native build output and VCS dirs.
//    Fewer watched files = fewer spurious rebuilds and far fewer
//    "bridge timeout" / "unable to resolve module" hiccups.
// ---------------------------------------------------------------------------
config.resolver = {
  ...config.resolver,
  blockList: [
    /\/ios\/Pods\/.*/,
    /\/ios\/build\/.*/,
    /\/ios\/DerivedData\/.*/,
    /\/android\/build\/.*/,
    /\/android\/app\/build\/.*/,
    /\/android\/\.gradle\/.*/,
    /\/\.git\/.*/,
    /\/\.expo\/web\/cache\/.*/,
  ],
};

module.exports = config;
