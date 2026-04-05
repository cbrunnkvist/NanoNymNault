const path = require('path');
const webpack = require('webpack');

module.exports = {
  resolve: {
    fallback: {
      "stream": require.resolve("stream-browserify"),
      "crypto": false
    },
    alias: {
      "node:stream": require.resolve("stream-browserify"),
      "@nanomyms/protocol": path.resolve(__dirname, "packages/protocol/src/index.ts"),
      "@nanomyms/crypto": path.resolve(__dirname, "packages/crypto/src/index.ts"),
      "@nanomyms/core": path.resolve(__dirname, "packages/core/src/index.ts"),
    }
  },
  plugins: [
    new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
      resource.request = resource.request.replace(/^node:/, '');
    }),
  ]
};
