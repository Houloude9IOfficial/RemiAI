# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
# Skip Playwright's postinstall browser download — Chromium is installed
# explicitly below (into /ms-playwright) so `npm ci` stays fast and cannot
# fail on restricted networks.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci

# Bundle Chromium for the Browser Automation tool (native Playwright).
# Installed here (same playwright version as the app) and copied into the
# runtime image below, so the server finds it via PLAYWRIGHT_BROWSERS_PATH.
# --only-shell: the tool is headless-only, and the headless shell is ~5×
# smaller than the full Chromium build.
RUN PLAYWRIGHT_BROWSERS_PATH=/ms-playwright node node_modules/playwright/cli.js install chromium --only-shell

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# The standalone server does not copy these folders automatically.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/db/migrations ./db/migrations

# Chromium for the Browser Automation tool (installed in the build stage
# with the same playwright version the app uses).
COPY --from=build /ms-playwright /ms-playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Playwright system dependencies (Chromium's shared libraries) — must be
# installed in the runtime image, which is a fresh slim base.
#
# The standalone output only ships the files the server imports at runtime:
# playwright/cli.js is traced (next.config.ts outputFileTracingIncludes) but
# its lib/ (program.js) and playwright-core's browsers.json are not, so the
# CLI can't run from the standalone copy. Pull the full packages from the
# build stage so `install-deps` works with the exact playwright version.
COPY --from=build /app/node_modules/playwright ./node_modules/playwright
COPY --from=build /app/node_modules/playwright-core ./node_modules/playwright-core
RUN node node_modules/playwright/cli.js install-deps chromium

# ffmpeg/ffprobe for the Media Tools (get_media_metadata, convert_media,
# extract_audio, extract_video_frames, transcribe_audio). Installed via apt so the runtime image
# stays lean — the media-tool resolver prefers these system binaries over the
# bundled ffmpeg-static/ffprobe-static copies that ship inside the standalone
# output (system ffmpeg is a newer build with more encoders).
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Keep the database and user uploads in the named /app/data volume.
RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/auth/status').then(r => process.exit(r.status < 500 ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
