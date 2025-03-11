const CopyWebpackPlugin = require("copy-webpack-plugin");
const path = require("path");

module.exports = {
  entry: {
    background: "./src/background.ts",
    content: "./src/content.ts",
    devtool: "./src/devtool.ts",
    panel: "./src/panel.ts",
    option: "./src/option.ts",
  },
  devtool: "inline-source-map",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: "src/manifest.json", to: "manifest.json" },
        { from: "src/devtool.html", to: "devtool.html" },
        { from: "src/option.html", to: "option.html" },
        { from: "src/panel.html", to: "panel.html" },
      ],
    }),
  ],
};
