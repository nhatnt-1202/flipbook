import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Link share cũ dạng /b/{id} → /book/{id}, để các link đã gửi đi vẫn mở được
  async redirects() {
    return [{ source: "/b/:id", destination: "/book/:id", permanent: true }];
  },
};

export default nextConfig;
