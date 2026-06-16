import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // met4citizen/TalkingHead + HeadAudio are published as untranspiled ESM and
  // import `three/addons/*`; let Next transpile them so they bundle cleanly.
  transpilePackages: ["@met4citizen/talkinghead", "@met4citizen/headaudio"]
};

export default nextConfig;
