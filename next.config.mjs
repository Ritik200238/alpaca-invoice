import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    config.module.rules.push({
      test: /\.md$/,
      type: 'asset/source',
    });

    config.experiments = {
      ...config.experiments,
      topLevelAwait: true,
    };

    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      {
        module: /(@provablehq[\\/]sdk|@provablehq[\\/]wasm)/,
        message: /topLevelAwait/,
      },
    ];

    config.optimization.minimize = false;

    return config;
  },
};

export default withNextIntl(nextConfig);
