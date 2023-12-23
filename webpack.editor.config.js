const path = require("path");

const HtmlWebpackPlugin = require("html-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");

module.exports = (env) => {
  console.log(env);

  const transpileOnly = true;
  const isProduction = false;

  const plugins = [
    new CleanWebpackPlugin(),
    new HtmlWebpackPlugin({
      chunks: ["Editor"],
      filename: "ls_editor_index.html",
      template: "./src/common/lewis_and_short/editor/ls_editor.html",
      minify: false,
    }),
  ];

  return {
    mode: isProduction ? "production" : "development",
    entry: {
      Editor: "./src/common/lewis_and_short/editor/ls_interactive_view.tsx",
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
      ],
    },
    resolve: {
      extensions: [".tsx", ".ts", ".js"],
      alias: {
        "@": path.resolve(__dirname, "src/"),
      },
    },
    plugins: plugins,
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
