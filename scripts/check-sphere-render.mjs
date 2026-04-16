import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const url = process.env.SONA_CHECK_URL ?? "http://127.0.0.1:3000";
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 }
];

async function readCanvasPixels(page, name) {
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();

  if (!box) {
    return { ok: false, reason: "missing canvas box" };
  }

  const buffer = await page.screenshot({
    clip: {
      height: Math.max(1, box.height),
      width: Math.max(1, box.width),
      x: Math.max(0, box.x),
      y: Math.max(0, box.y)
    }
  });
  await mkdir("/tmp/sona-sphere-checks", { recursive: true });
  await writeFile(`/tmp/sona-sphere-checks/${name}.png`, buffer);

  const png = PNG.sync.read(buffer);
  let litPixels = 0;
  let cyanVioletPixels = 0;

  for (let i = 0; i < png.data.length; i += 16) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];

    if (r + g + b > 54) {
      litPixels += 1;
    }

    if ((b > r + 8 && b > 28) || (r > 35 && b > 44 && g < 80)) {
      cyanVioletPixels += 1;
    }
  }

  return {
    ok: litPixels > 320 && cyanVioletPixels > 120,
    cyanVioletPixels,
    height: png.height,
    litPixels,
    width: png.width
  };
}

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader"]
});

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForSelector("canvas", { state: "attached" });
    await page.waitForTimeout(1400);

    const idlePixels = await readCanvasPixels(page, `${viewport.name}-idle`);
    if (!idlePixels.ok) {
      throw new Error(
        `${viewport.name} idle sphere failed pixel check: ${JSON.stringify(
          idlePixels
        )}`
      );
    }

    await page.getByLabel("Start listening").evaluate((button) => {
      if (button instanceof HTMLButtonElement) {
        button.click();
      }
    });
    await page.waitForFunction(
      () => document.body.innerText.includes("Listening"),
      { timeout: 1800 }
    );
    const listeningStatus = await page.getByText("Listening").isVisible();

    if (!listeningStatus) {
      throw new Error(`${viewport.name} did not enter listening state`);
    }

    await page.getByPlaceholder("Ask Sona anything").fill("Tune the sphere");
    await page.locator("form").evaluate((form) => {
      if (form instanceof HTMLFormElement) {
        form.requestSubmit();
      }
    });
    await page.waitForFunction(() => document.body.innerText.includes("Speaking"), {
      timeout: 2600
    });
    const speakingStatus = await page.getByText("Speaking").isVisible();

    if (!speakingStatus) {
      throw new Error(`${viewport.name} did not enter speaking state`);
    }

    const speakingPixels = await readCanvasPixels(
      page,
      `${viewport.name}-speaking`
    );
    if (!speakingPixels.ok) {
      throw new Error(
        `${viewport.name} speaking sphere failed pixel check: ${JSON.stringify(
          speakingPixels
        )}`
      );
    }

    console.log(
      `${viewport.name}: ${idlePixels.litPixels} idle lit samples, ${speakingPixels.litPixels} speaking lit samples`
    );
    await page.close();
  }
} finally {
  await browser.close();
}
