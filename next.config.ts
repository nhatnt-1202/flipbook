import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Link share cũ dạng /b/{id} và /book/{id} → /view/{id}, để các link đã gửi đi vẫn mở được
  async redirects() {
    return [
      { source: "/b/:id", destination: "/view/:id", permanent: true },
      { source: "/book/:id", destination: "/view/:id", permanent: true },
    ];
  },
};

export default nextConfig;
