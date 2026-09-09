declare module "ffprobe-static" {
  /**
   * Absolute path to the bundled ffprobe binary for the current platform
   * (e.g. `.../ffprobe-static/bin/win32/x64/ffprobe.exe`).
   * See https://github.com/eugeneware/ffprobe-static
   */
  export const path: string;
}