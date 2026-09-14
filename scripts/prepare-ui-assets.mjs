// Download the presentation assets once; runtime and builds stay independent of font CDNs.
import { mkdir, writeFile } from "node:fs/promises";

const assets = [
  [
    "paneer.jpg",
    "https://www.cookwithmanali.com/wp-content/uploads/2019/05/Paneer-Butter-Masala.jpg",
  ],
  [
    "palak.jpg",
    "https://www.maggi.in/sites/default/files/srh_recipes/f77b8de2a747b2c480726ef1dd65d53e.jpg",
  ],
  [
    "chole.jpg",
    "https://cdn.apartmenttherapy.info/image/upload/f_jpg,q_auto:eco,c_fill,g_auto,w_900,ar_16:9/k%2FPhoto%2FRecipe%20Ramp%20Up%2F2022-03-Chole%2Fchole-2",
  ],
];
await mkdir("public/food", { recursive: true });
await mkdir("public/fonts", { recursive: true });
async function download(url, path) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
  console.log(`Saved ${path}`);
}
const jobs = assets.map(([name, url]) => download(url, `public/food/${name}`));
jobs.push(
  download(
    "https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/OFL.txt",
    "public/fonts/DM-Sans-OFL.txt",
  ),
);
jobs.push(
  download(
    "https://raw.githubusercontent.com/google/fonts/main/ofl/lora/OFL.txt",
    "public/fonts/Lora-OFL.txt",
  ),
);
for (const [family, name] of [
  ["DM+Sans:wght@400..700", "dm-sans"],
  ["Lora:wght@400..600", "lora"],
]) {
  jobs.push(
    (async () => {
      const response = await fetch(
        `https://fonts.googleapis.com/css2?family=${family}&display=swap`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          },
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!response.ok) throw new Error(`Font CSS ${name}: ${response.status}`);
      const css = await response.text();
      const urls = [...css.matchAll(/url\((https:[^)]+)\)/g)];
      if (!urls.length) throw new Error(`No font URL for ${name}`);
      await download(urls.at(-1)[1], `public/fonts/${name}.woff2`);
    })(),
  );
}
const results = await Promise.allSettled(jobs);
for (const result of results)
  if (result.status === "rejected") {
    console.error(result.reason.message);
    process.exitCode = 1;
  }
