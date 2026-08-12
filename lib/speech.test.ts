import assert from "node:assert/strict";
import test from "node:test";

/** A stand-in for what `registerPlugin()` hands back: a Proxy that turns any
 *  property access into a bridge call. Capacitor's real one answers `.then`
 *  the same way — with a call to a native method of that name. */
function pluginProxy(onCall: (method: string) => void) {
  return new Proxy(
    {},
    {
      get(_target, property) {
        const name = String(property);
        onCall(name);
        return () => Promise.resolve();
      },
    }
  );
}

test("the plugin is never handed back bare from an async function", async () => {
  const { wrapEngine } = await import("./readAloud.ts");

  const touched: string[] = [];
  const proxy = pluginProxy((method) => touched.push(method));

  // This is the trap, and it is worth demonstrating rather than describing:
  // resolving a promise with a thenable makes the runtime call `.then` on it,
  // the proxy takes that for a plugin method, and on a device the call goes to
  // the bridge and never comes back — the await hangs for ever.
  const bare = async () => proxy;
  await Promise.race([
    bare().catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 50)),
  ]);
  assert.ok(touched.includes("then"), "a bare return does ask the proxy for .then");

  // Wrapped in a holder, nothing about it looks thenable.
  touched.length = 0;
  const held = await wrapEngine({ TextToSpeech: proxy });
  assert.equal(touched.includes("then"), false, "the wrapper must not touch .then");
  assert.equal(held.tts, proxy, "and it still hands over the plugin itself");
});
