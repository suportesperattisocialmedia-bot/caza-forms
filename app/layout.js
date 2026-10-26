import "./globals.css";

export const metadata = {
  title: "Caza Forms",
  description: "Formulários conversacionais da Caza Millennium",
};

export const viewport = { width: "device-width", initialScale: 1, themeColor: "#050505" };

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:wght@500;600&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
