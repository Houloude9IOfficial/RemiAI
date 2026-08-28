import { ImageResponse } from "next/og";
import { readFileSync } from "fs";
import { join } from "path";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT = "RemiAI - Your Local AI Assistant";

/** Reads a public asset and returns it as a base64 data URI so ImageResponse
 *  can render it without network access at build time. */
function toDataUri(rel: string): string {
  const buf = readFileSync(join(process.cwd(), "public", rel));
  return `data:image/png;base64,${buf.toString("base64")}`;
}

const LOGO_URI = toDataUri("RemiAI.png");
const SCREENSHOT_URI = toDataUri("assets/RemiAIv2Light.png");

const CHIPS = ["File System", "Persistent Memory", "MCP Tools", "Agent System"];

type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

type OgFont = {
  name: string;
  data: ArrayBuffer;
  weight: FontWeight;
  style: "normal";
};

/** Reads the vendored Inter TTFs from disk (deterministic, offline-safe).
 *  ImageResponse requires TTF/OTF; Google Fonts WOFF2 would fail. */
function loadInterFonts(): OgFont[] {
  const weights: FontWeight[] = [400, 500, 600, 700, 800];
  return weights.map((weight) => {
    const buf = readFileSync(join(process.cwd(), "fonts", `Inter-${weight}.ttf`));
    const data = new Uint8Array(buf).buffer as ArrayBuffer;
    return { name: "Inter", data, weight, style: "normal" };
  });
}

export function renderOgImage(): ImageResponse {
  const fonts = loadInterFonts();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#f6f7f9",
          position: "relative",
          fontFamily: "Inter",
        }}
      >
        {/* Decorative glows */}
        <div
          style={{
            position: "absolute",
            top: -220,
            right: -160,
            width: 640,
            height: 640,
            borderRadius: 9999,
            background:
              "radial-gradient(circle, rgba(37,99,235,0.16) 0%, rgba(37,99,235,0) 60%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -260,
            left: -200,
            width: 560,
            height: 560,
            borderRadius: 9999,
            background:
              "radial-gradient(circle, rgba(59,130,246,0.10) 0%, rgba(59,130,246,0) 60%)",
          }}
        />

        {/* Content */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            width: "100%",
            height: "100%",
            padding: 64,
            gap: 48,
            alignItems: "center",
            position: "relative",
          }}
        >
          {/* Left column */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minWidth: 0,
              gap: 20,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={LOGO_URI}
                width={52}
                height={52}
                alt="RemiAI logo"
                style={{ borderRadius: 12, display: "flex" }}
              />
              <span
                style={{
                  fontSize: 40,
                  fontWeight: 800,
                  color: "#0f1115",
                  letterSpacing: -0.5,
                }}
              >
                RemiAI
              </span>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                fontSize: 56,
                fontWeight: 800,
                color: "#0f1115",
                lineHeight: 1.05,
                letterSpacing: -1,
              }}
            >
              <span>Your local AI assistant</span>
            </div>

            <div
              style={{
                fontSize: 20,
                fontWeight: 400,
                color: "#52525b",
                lineHeight: 1.5,
                maxWidth: 480,
              }}
            >
              Self-hosted. Private by design. Deep file system access,
              persistent memory, and MCP tool support, all under your control.
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                marginTop: 6,
              }}
            >
              {CHIPS.map((chip) => (
                <div
                  key={chip}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "8px 14px",
                    borderRadius: 9999,
                    background: "#ffffff",
                    border: "1px solid #e4e7ec",
                    fontSize: 16,
                    fontWeight: 600,
                    color: "#3f3f46",
                  }}
                >
                  {chip}
                </div>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 12,
              }}
            >
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 500,
                  color: "#71717a",
                }}
              >
                github.com/Houloude9IOfficial/RemiAI
              </span>
            </div>
          </div>

          {/* Right column: dashboard screenshot in a browser frame */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 480,
              borderRadius: 20,
              overflow: "hidden",
              background: "#ffffff",
              border: "1px solid #e4e7ec",
              boxShadow: "0 24px 64px -24px rgba(15,23,42,0.25)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "14px 18px",
                background: "#fafbfc",
                borderBottom: "1px solid #eef0f3",
              }}
            >
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: 9999,
                  background: "#ff5f57",
                }}
              />
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: 9999,
                  background: "#febc2e",
                }}
              />
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: 9999,
                  background: "#28c840",
                }}
              />
              <div
                style={{
                  flex: 1,
                  marginLeft: 10,
                  padding: "5px 12px",
                  borderRadius: 9999,
                  background: "#eef0f3",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "#71717a",
                }}
              >
                localhost:3000
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={SCREENSHOT_URI}
              width={480}
              height={254}
              alt="RemiAI dashboard screenshot"
              style={{ display: "flex" }}
            />
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts,
    },
  );
}
