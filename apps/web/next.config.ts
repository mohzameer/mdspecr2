import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/docs', destination: '/docs/api-reference', permanent: true },
      { source: '/docs/getting-started', destination: '/docs/api-reference', permanent: true },
      { source: '/docs/cli-reference', destination: '/docs/api-reference', permanent: true },
      { source: '/docs/cli', destination: '/docs/api-reference', permanent: true },
      { source: '/docs/mdspecmap', destination: '/docs/api-reference', permanent: true },
      { source: '/docs/reference', destination: '/docs/api-reference', permanent: true },
    ]
  },
};

export default nextConfig;
