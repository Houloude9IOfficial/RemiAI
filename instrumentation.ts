/**
 * Next.js instrumentation hook.
 *
 * The Node-only implementation lives in `instrumentation.node.ts`. Keeping
 * that import behind the runtime guard prevents native/server-only modules
 * (for example `tar` and Node's `zlib`) from entering browser fallback bundles
 * during development compilation.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNodeRuntime } = await import("./instrumentation.node");
    await registerNodeRuntime();
  }
}
