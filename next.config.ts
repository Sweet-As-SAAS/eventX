import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The council's blank special licence form, read from disk when a filled copy is exported.
  outputFileTracingIncludes: {
    "/api/documents/[id]/export": ["./lib/pdf/forms/**"],
    "/api/events/[id]/export": ["./lib/pdf/forms/**"],
  },
};

export default nextConfig;
