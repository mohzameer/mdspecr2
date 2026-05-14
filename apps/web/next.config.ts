import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/docs', destination: '/docs/api-reference', permanent: true },
      { source: '/docs/getting-started', destination: '/docs/api-reference', permanent: true },
      { source: '/docs/quickstart', destination: '/docs/api-reference', permanent: true },
      { source: '/docs/cli-reference', destination: '/docs/api-reference#cli', permanent: true },
      { source: '/docs/cli', destination: '/docs/api-reference#cli', permanent: true },
      { source: '/docs/mdspecmap', destination: '/docs/api-reference#mdspecmap', permanent: true },
      { source: '/docs/configuration', destination: '/docs/api-reference#mdspecmap', permanent: true },
      { source: '/docs/reference', destination: '/docs/api-reference', permanent: true },
      { source: '/docs/integrations', destination: '/docs/api-reference#s3', permanent: true },
      { source: '/docs/errors', destination: '/docs/api-reference#cli', permanent: true },
    ]
  },
};

export default nextConfig;
