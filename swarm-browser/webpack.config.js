var path = require('path')
var webpack = require('webpack')

module.exports = {
  entry: [ './index' ],
  output: {
    path: path.join(__dirname, 'static'),
    filename: 'bundle.js',
    publicPath: '/static/'
  },
  plugins: [
    new webpack.optimize.OccurenceOrderPlugin(),
    new webpack.NoErrorsPlugin()
  ],
  module: {
    loaders: [
      { test: /\.css$/, loader: 'style-loader!css-loader?modules' },
      { test: /\.(png|gif)$/, loader: 'url-loader?name=[name]@[hash].[ext]&limit=50000' },
      { test: /\.json$/, loader: 'json-loader' }
    ]
  }
}
