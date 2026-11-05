import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Read from disk when the checklist is built, so tracing can't find it alone.
  outputFileTracingIncludes: {
    "/api/consignment/outlets/[key]/checklist": ["./src/lib/consignment/checklist-letterhead.pdf"],
  },
};

export default nextConfig;
