import localFont from "next/font/local";
import "./globals.css";
const bodyFont = localFont({
  src: "../public/fonts/dm-sans.woff2",
  variable: "--font-body",
  display: "swap",
  weight: "400 700",
});
const editorialFont = localFont({
  src: "../public/fonts/lora.woff2",
  variable: "--font-editorial",
  display: "swap",
  weight: "400 600",
});
export const metadata = {
  title: "Sous — cook what you want",
  description:
    "A little help in the kitchen. Sous finds real recipes, checks what you have, and adds the missing groceries to your cart. You review and pay.",
};
export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${bodyFont.variable} ${editorialFont.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('sous-theme');document.documentElement.dataset.theme=t||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
