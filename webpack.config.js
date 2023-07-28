const path = require("path");
const cp = require("child_process");

const HtmlWebpackPlugin = require("html-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const CompressionPlugin = require("compression-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const { DefinePlugin } = require("webpack");

function getHash() {
  // The Heroku build environment removes git metadata, but provides
  // commit information via environment variable instead.
  if (process.env.SOURCE_VERSION !== undefined) {
    return process.env.SOURCE_VERSION;
  }
  const { stdout } = cp.spawnSync("git", ["rev-parse", "HEAD"]);
  return stdout.toString();
}

module.exports = (env) => {
  console.log(env);

  const transpileOnly = env.transpileOnly === true;
  const isProduction = env.production === true;
  const shouldMinimize = isProduction;

  const plugins = [
    new CleanWebpackPlugin(),
    new DefinePlugin({
      COMMIT_HASH: JSON.stringify(getHash()),
      BUILD_DATE: JSON.stringify(new Date().toString()),
      DEFAULT_EXPERIMENTAL_MODE: JSON.stringify(!isProduction)
    }),
    new HtmlWebpackPlugin({
      chunks: ["Root"],
      filename: "index.html",
      template: "./src/web/client/root.html",
      minify: shouldMinimize,
    }),
  ];
  if (isProduction) {
    plugins.push(new CompressionPlugin());
  }
  const productionOptimization = {
    minimize: shouldMinimize,
    minimizer: [
      new TerserPlugin({
        include: "vendorBundle",
      }),
    ],
    splitChunks: {
      chunks: "all",
      minSize: 250000,
      maxSize: 500000,
      cacheGroups: {
        vendorBundle: {
          test: /[\\/]node_modules[\\/]/,
          priority: 0,
          reuseExistingChunk: true,
          name(_module, _chunks, cacheGroupKey) {
            return `${cacheGroupKey}`;
          },
        },
        srcBundle: {
          priority: -5,
          reuseExistingChunk: true,
        },
      },
    },
  };

  return {
    mode: isProduction ? "production" : "development",
    entry: {
      Root: "./src/web/client/root.tsx",
    },
    watchOptions: {
      ignored: /node_modules/,
      aggregateTimeout: 500,
      poll: 1500,
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: [
            {
              loader: "ts-loader",
              options: {
                configFile: "tsconfig.json",
                transpileOnly: transpileOnly,
              },
            },
          ],
          exclude: /node_modules/,
        },
        {
          test: /\.css$/i,
          use: ["css-loader"],
        },
      ],
    },
    resolve: {
      extensions: [".tsx", ".ts", ".js"],
      alias: {
        "@": path.resolve(__dirname, "src/"),
      },
    },
    plugins: plugins,
    optimization: isProduction ? productionOptimization : {},
    performance: {
      maxEntrypointSize: 600000,
    },
    output: {
      filename: "[name].[contenthash].client-bundle.js",
      path: path.resolve(__dirname, "genfiles_static"),
    },
    stats: {
      builtAt: true,
      entrypoints: true,
    },
  };
};
