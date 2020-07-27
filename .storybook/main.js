const path = require('path');

module.exports = {
  stories: [
    '../sketches/**/*.stories.mdx',
    '../sketches/**/*.stories.@(js|jsx|ts|tsx)',
  ],
  addons: [
    '@storybook/addon-links',
    '@storybook/addon-actions',
    '@storybook/addon-essentials',
  ],
  webpackFinal: (config) => {
    return {
      ...config,
      resolve: {
        ...config.resolve,
        alias: {
          tinyqueue: path.resolve(
            __dirname,
            '../node_modules/tinyqueue/tinyqueue.js'
          ),
        },
      },
    };
  },
};
